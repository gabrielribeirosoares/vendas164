import React, { useState, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { brl, isProntaEntrega, whatsappLink } from '@/lib/format';
import { trackOrder, getTrackingStatusLabel, shouldUpdateDeliveryStatus } from '@/lib/trackingService';
import { toast } from 'sonner';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageCircle, Clock, Package, Truck, ChevronDown, Trash2, XCircle, Search, Filter, LayoutGrid, List, Download, Plus, ExternalLink, Zap, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaymentBadge } from '@/components/StatusBadge';
import { Countdown } from '@/components/Countdown';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { prepararDadosExportacaoFinanceira } from '@/lib/exportFinanceiro';
import { getCustomerFromCache } from '@/lib/customerCache';
import { ManualReservationDialog } from '@/components/vendedor/ProductManager';
import { OrderInstallmentsDialog } from '@/components/vendedor/OrderInstallmentsDialog';
import type { Tables } from '@/integrations/supabase/types';

export type Product = Tables<'products'>;
const PAGE_SIZE = 50;

export type OrderRow = Tables<"orders"> & {
  products: Tables<"products"> | null;
  profiles: { name: string | null; email: string | null; phone: string | null } | null;
  order_installments?: any[];
};

function getOrderSummaryMessage(o: OrderRow, quantity: number, displayName: string) {
  const modelName = `${o.products?.brand || ''} ${o.products?.model || 'Miniatura'}`.trim();
  const total = Number(o.total_price) * quantity;
  const customSignal = Number((o.products as any)?.down_payment_amount || 0);
  const expectedSignal = (customSignal > 0 ? customSignal : Math.round(Number(o.total_price) * 0.2 * 100) / 100) * quantity;
  const isPronta = o.payment_status === "pronta_entrega" || isProntaEntrega(o.products);
  const isSemSinal = o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada" || isPronta;

  let msg = `Olá ${displayName},\n\nAqui é o resumo da sua reserva:\n- Miniatura: *${modelName}*\n`;
  if (quantity > 1) msg += `- Quantidade: ${quantity}x\n`;
  msg += `- Valor Total: *${brl(total)}*\n`;
  
  if (o.payment_status === "aguardando_sinal") {
    msg += `- Sinal a pagar: *${brl(expectedSignal)}*\n`;
  } else if (o.payment_status === "sinal_pago") {
    const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid");
    const totalPaidInsts = paidInsts.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    const dynamicBalance = Math.max(0, total - (Number(o.down_payment) * quantity) - totalPaidInsts);
    msg += `- Sinal pago: *${brl(Number(o.down_payment) * quantity)}*\n- Saldo restante: *${brl(dynamicBalance)}*\n`;
  } else if (o.payment_status === "quitado") {
    msg += `- Status: *Totalmente Quitado*\n`;
  } else if (o.payment_status === "pronta_entrega" || (isPronta && isSemSinal)) {
    msg += `- Status: *Pronta Entrega (Envio Imediato)*\n`;
  } else if (isSemSinal) {
    msg += `- Pagamento na chegada do produto.\n`;
  }
  
  msg += `\nAgradecemos a preferência!`;
  return msg;
}

function getWhatsAppTemplates(o: OrderRow, quantity: number, displayName: string, storePixKey?: string) {
  const modelName = `${o.products?.brand || ''} ${o.products?.model || 'Miniatura'}`.trim();
  const customSignal = Number((o.products as any)?.down_payment_amount || 0);
  const expectedSignal = (customSignal > 0 ? customSignal : Math.round(Number(o.total_price) * 0.2 * 100) / 100) * quantity;
  const signal = Number(o.down_payment) > 0 ? Number(o.down_payment) * quantity : expectedSignal;
  const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid");
  const totalPaidInsts = paidInsts.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
  const remaining = Math.max(0, (Number(o.total_price) * quantity) - signal - totalPaidInsts);
  const tracking = o.tracking_code?.trim();
  const trackingLink = tracking ? `https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(tracking)}` : '';
  const pixInfo = storePixKey ? `\n\n🔑 *Chave PIX da loja:* ${storePixKey}` : '';

  const summary = getOrderSummaryMessage(o, quantity, displayName);

  const signalReminder = `Olá ${displayName}!\n\nPassando para lembrar da sua reserva da miniatura *${modelName}*${quantity > 1 ? ` (${quantity}x)` : ''}.\n\n📌 *Valor do Sinal:* ${brl(signal)}${o.reservation_expires_at ? `\n⏳ *Prazo de Validade:* ${new Date(o.reservation_expires_at).toLocaleDateString("pt-BR")}` : ''}${pixInfo}\n\nAssim que efetuar o pagamento do sinal, nos envie o comprovante para confirmarmos sua reserva! Muito obrigado!`;

  const arrived = `Olá ${displayName}, ótimas notícias! 📦🎉\n\nA sua miniatura *${modelName}*${quantity > 1 ? ` (${quantity}x)` : ''} acabou de chegar em nosso estoque!\n\n💰 *Saldo restante a pagar:* ${brl(remaining)}${pixInfo}\n\nPor favor, nos envie o comprovante e confirme seu endereço de entrega para realizarmos o despacho!`;

  const shipped = `Olá ${displayName}! 🚚💨\n\nSeu pedido da miniatura *${modelName}* foi postado e já está a caminho!\n\n📦 *Código de Rastreio:* ${tracking || 'Em processamento'}${trackingLink ? `\n🔗 *Acompanhe pelo link:* ${trackingLink}` : ''}\n\nQualquer dúvida estamos à disposição!`;

  return {
    summary,
    signalReminder,
    arrived,
    shipped,
  };
}

interface OrderWhatsAppDropdownProps {
  order: OrderRow;
  quantity: number;
  displayName: string;
  phone?: string | null;
  pixKey?: string | null;
  variant?: "badge" | "button" | "icon";
}

function OrderWhatsAppDropdown({
  order,
  quantity,
  displayName,
  phone,
  pixKey,
  variant = "badge",
}: OrderWhatsAppDropdownProps) {
  if (!phone) {
    return <span className="text-xs text-muted-foreground/60 italic">Sem WhatsApp</span>;
  }

  const templates = getWhatsAppTemplates(order, quantity, displayName, pixKey || undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "badge" ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium font-mono border border-emerald-500/30 transition-all cursor-pointer shadow-sm hover:scale-105"
            title="Opções de mensagem do WhatsApp"
          >
            <MessageCircle className="size-3.5" />
            <span>WhatsApp</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        ) : variant === "icon" ? (
          <Button size="icon" variant="ghost" className="size-7 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-full" title="Opções WhatsApp">
            <MessageCircle className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs">
            <MessageCircle className="size-3.5" />
            <span>WhatsApp</span>
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Templates Rápidos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.summary)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <MessageCircle className="size-4 text-emerald-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Resumo do Pedido</span>
              <span className="text-[10px] text-muted-foreground">Itens, valor total e sinal</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.signalReminder)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Clock className="size-4 text-amber-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Lembrete de Sinal</span>
              <span className="text-[10px] text-muted-foreground">Cobrança com PIX e prazo</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.arrived)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Package className="size-4 text-purple-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Miniatura Chegou!</span>
              <span className="text-[10px] text-muted-foreground">Aviso de saldo a quitar</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.shipped)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Truck className="size-4 text-blue-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Envio com Rastreio</span>
              <span className="text-[10px] text-muted-foreground">Link oficial dos Correios</span>
            </div>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrdersTab({
  orders,
  storeId,
  storeColor,
  products = [],
}: {
  orders: OrderRow[];
  storeId?: string;
  storeColor?: string;
  products?: Product[];
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("todos");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("todos");
  const [categoryFilter, setCategoryFilter] = useState<"todos" | "pre_venda" | "pronta_entrega">("todos");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [trackingUpdating, setTrackingUpdating] = useState<Set<string>>(new Set());
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  async function handleTrackingUpdate(orderId: string, code: string, currentStatus?: string) {
    if (!code?.trim()) return;
    const normalizedCode = code.toUpperCase().trim();
    setTrackingUpdating((prev) => new Set([...prev, orderId]));
    try {
      const result = await trackOrder(normalizedCode);
      if (result && result.status !== "not_found") {
        if (result.status === "delivered") {
          const { error } = await supabase
            .from("orders")
            .update({ delivery_status: "entregue" })
            .eq("id", orderId);
          if (error) {
            toast.error("Erro ao atualizar status de envio.");
          } else {
            toast.success(`Status atualizado: Entregue`);
          }
        } else if (result.status === "in_transit") {
          if (currentStatus === "entregue") {
            toast.info("O pedido já está marcado como Entregue.");
          } else {
            const { error } = await supabase
              .from("orders")
              .update({ delivery_status: "em_transito" })
              .eq("id", orderId);
            if (error) {
              toast.error("Erro ao atualizar status de envio.");
            } else {
              toast.success(`Status atualizado: Em trânsito`);
            }
          }
        }
        await queryClient.invalidateQueries();
      } else {
        toast.info(`Rastreio ${normalizedCode}: sem eventos automáticos no momento.`, {
          action: {
            label: "Ver no Correios",
            onClick: () =>
              window.open(
                `https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(normalizedCode)}`,
                "_blank"
              ),
          },
        });
      }
    } finally {
      setTrackingUpdating((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  const activeOrders = useMemo(
    () => orders.filter((o) => o.payment_status !== "cancelado" && o.delivery_status !== "cancelado"),
    [orders]
  );
  const activeOrdersCount = activeOrders.length;
  const prontaEntregaOrdersCount = useMemo(
    () => activeOrders.filter((o) => isProntaEntrega(o.products)).length,
    [activeOrders]
  );
  const preVendaOrdersCount = useMemo(
    () => activeOrders.filter((o) => !isProntaEntrega(o.products)).length,
    [activeOrders]
  );

  async function handleTrackingSave(ids: string[], code: string) {
    const { error } = await supabase
      .from("orders")
      .update({ tracking_code: code.trim() || null })
      .in("id", ids);

    if (error) {
      console.error("Erro ao salvar rastreio:", error);
      if (error.code === "PGRST204" || error.message?.includes("tracking_code") || error.details?.includes("tracking_code")) {
        return toast.error(
          "A coluna 'tracking_code' precisa ser criada no Supabase! Execute o comando SQL fornecido no Supabase Dashboard.",
          { duration: 7000 }
        );
      }
      return toast.error("Não foi possível salvar o código de rastreio. Verifique se executou a SQL no Supabase.");
    }
    queryClient.invalidateQueries();
    toast.success("Código de rastreio salvo!");
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        if (new Date(o.created_at) < start) return false;
      }
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999Z`);
        if (new Date(o.created_at) > end) return false;
      }

      // Filtro por tipo de produto (Pré-venda vs Pronta Entrega)
      if (categoryFilter === "pronta_entrega") {
        if (!isProntaEntrega(o.products)) return false;
      } else if (categoryFilter === "pre_venda") {
        if (isProntaEntrega(o.products)) return false;
      }

      // Ocultar cancelados por padrão caso o usuário não tenha filtrado especificamente por 'cancelado'
      if (paymentFilter === "todos" && deliveryFilter === "todos") {
        if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") {
          return false;
        }
      }

      if (paymentFilter === "atrasado") {
        if (o.payment_status !== "aguardando_sinal" || !o.reservation_expires_at || new Date(o.reservation_expires_at) >= new Date()) {
          return false;
        }
      } else if (paymentFilter !== "todos" && o.payment_status !== paymentFilter) {
        return false;
      }

      if (deliveryFilter !== "todos" && o.delivery_status !== deliveryFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const cleanQ = q.replace(/^#/, "");

      const clientName = (o.profiles?.name || "").toLowerCase();
      const clientEmail = (o.profiles?.email || "").toLowerCase();
      const clientPhone = (o.profiles?.phone || "").toLowerCase();
      const prodModel = (o.products?.model || "").toLowerCase();
      const prodBrand = (o.products?.brand || "").toLowerCase();
      const orderId = (o.id || "").toLowerCase();
      const trackingCode = (o.tracking_code || "").toLowerCase();

      return (
        clientName.includes(q) ||
        clientEmail.includes(q) ||
        clientPhone.includes(q) ||
        prodModel.includes(q) ||
        prodBrand.includes(q) ||
        orderId.includes(q) ||
        (cleanQ.length > 0 && orderId.includes(cleanQ)) ||
        trackingCode.includes(q)
      );
    });
  }, [orders, searchQuery, startDate, endDate, paymentFilter, deliveryFilter, categoryFilter]);

  type GroupedOrderRow = { order: OrderRow; quantity: number; ids: string[] };

  const groupedOrders = useMemo(() => {
    return filteredOrders.map(o => ({ order: o, quantity: 1, ids: [o.id] } as GroupedOrderRow));
  }, [filteredOrders]);

  const pages = Math.max(1, Math.ceil(groupedOrders.length / PAGE_SIZE));
  const rows = groupedOrders.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function adjustStockOnCancel(productId: string, isCancelling: boolean, quantity: number) {
    if (!productId) return;
    const { data: product } = await supabase
      .from("products")
      .select("stock, is_open")
      .eq("id", productId)
      .maybeSingle();

    if (!product) return;

    if (isCancelling) {
      const newStock = (product.stock ?? 0) + quantity;
      await supabase
        .from("products")
        .update({ stock: newStock, is_open: true })
        .eq("id", productId);
    } else {
      const newStock = Math.max(0, (product.stock ?? 0) - quantity);
      await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", productId);
    }
  }

  async function updateGroup(
    ids: string[],
    patch: Partial<Pick<Tables<"orders">, "down_payment" | "payment_status" | "delivery_status" | "reservation_expires_at">>,
  ) {
    const { error } = await supabase.from("orders").update(patch).in("id", ids);

    if (error) return toast.error("Não foi possível atualizar a reserva.");
    queryClient.invalidateQueries();
  }

  async function handleDeleteGroup(item: GroupedOrderRow) {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente esta reserva (${item.quantity} unidade(s))?`)) {
      return;
    }
    const { order: o, quantity, ids } = item;
    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    if (!wasCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
    }
    const { error } = await supabase.from("orders").delete().in("id", ids);
    if (!error) {
      // Exclui parcelas explicitamente caso o banco não tenha cascade configurado
      await supabase.from("order_installments").delete().in("order_id", ids);
    }
    if (error) {
      return toast.error("Não foi possível excluir a reserva.");
    }
    queryClient.invalidateQueries();
    toast.success("Reserva excluída!");
  }

  async function handlePaymentStatusChange(item: GroupedOrderRow, newStatus: string) {
    const { order: o, quantity, ids } = item;
    const groupId = ids[0];
    let downPayment = Number(drafts[groupId] ?? o.down_payment);
    const totalPrice = Number(o.total_price);
    const customSignal = Number((o.products as any)?.down_payment_amount || 0);

    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
      // Apaga as parcelas pendentes caso a reserva seja cancelada
      await supabase.from("order_installments").delete().in("order_id", ids);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false, quantity);
    }

    const patch: any = { payment_status: newStatus };

    if (newStatus === "sinal_pago") {
      if (customSignal > 0) {
        downPayment = customSignal;
      } else if (downPayment === 0 && totalPrice > 0) {
        downPayment = Math.round(totalPrice * 0.2 * 100) / 100;
      }
      patch.down_payment = downPayment;
      patch.reservation_expires_at = null;

      // Ajustar parcelas pendentes para descontar o sinal recém-pago
      for (const id of ids) {
        const { data: insts } = await supabase.from("order_installments").select("id, amount, status").eq("order_id", id);
        if (insts && insts.length === 1 && insts[0].status === "pending") {
          const expectedAmount = Math.max(0, totalPrice - downPayment);
          await supabase.from("order_installments").update({ amount: expectedAmount }).eq("id", insts[0].id);
        }
      }
    } else if (newStatus === "quitado") {
      // Manter o sinal original, não substituir pelo total
      patch.down_payment = downPayment;
      patch.reservation_expires_at = null;
      // Marcar todas as parcelas pendentes como pagas automaticamente
      for (const id of ids) {
        await supabase.from("order_installments").update({ status: "paid" }).eq("order_id", id).eq("status", "pending");
      }
    } else if (newStatus === "pronta_entrega" || newStatus === "sem_sinal") {
      downPayment = 0;
      patch.down_payment = 0;
      patch.reservation_expires_at = null;
    } else if (newStatus === "aguardando_sinal") {
      downPayment = 0;
      patch.down_payment = 0;
      if (!o.reservation_expires_at) {
        const prod = o.products as any;
        if (prod?.payment_deadline_date) {
          patch.reservation_expires_at = new Date(prod.payment_deadline_date + "T23:59:59").toISOString();
        } else if (prod?.payment_deadline_hours && Number(prod.payment_deadline_hours) > 0) {
          patch.reservation_expires_at = new Date(Date.now() + Number(prod.payment_deadline_hours) * 3600 * 1000).toISOString();
        } else {
          patch.reservation_expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
      }
    } else {
      patch.down_payment = downPayment;
    }

    setDrafts((prev) => ({ ...prev, [groupId]: String(downPayment) }));
    await updateGroup(ids, patch);

    if (!wasCancelled && isNowCancelled) {
      toast.success(`Reserva cancelada! +${quantity} unidade(s) devolvida(s) ao estoque.`);
    } else {
      toast.success("Reserva atualizada.");
    }
  }

  async function handleDeliveryStatusChange(item: GroupedOrderRow, newStatus: string) {
    const { order: o, quantity, ids } = item;
    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
      // Apaga as parcelas pendentes caso o envio/reserva seja cancelado
      await supabase.from("order_installments").delete().in("order_id", ids);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false, quantity);
    }
    await updateGroup(ids, { delivery_status: newStatus });

    if (!wasCancelled && isNowCancelled) {
      toast.success(`Envio cancelado! +${quantity} unidade(s) devolvida(s) ao estoque.`);
    } else {
      toast.success("Status de envio atualizado.");
    }
  }

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 350,
    overscan: 5,
  });
  
  const handleDragStart = (e: React.DragEvent, item: GroupedOrderRow) => {
    e.dataTransfer.setData("application/json", JSON.stringify(item.ids));
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    try {
      const ids = JSON.parse(e.dataTransfer.getData("application/json"));
      if (ids && ids.length > 0) {
        // Find the item to get quantity and product ID for stock adjustments
        const item = groupedOrders.find(g => g.ids[0] === ids[0]);
        if (item) {
           await handlePaymentStatusChange(item, newStatus);
        }
      }
    } catch (err) {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const kanbanBoard = useMemo(() => {
    const cols = {
      aguardando_sinal: { title: "Aguardando Sinal", items: [] as GroupedOrderRow[] },
      pronta_entrega: { title: "Pronta Entrega", items: [] as GroupedOrderRow[] },
      sem_sinal: { title: "Sem Sinal / Chegada", items: [] as GroupedOrderRow[] },
      sinal_pago: { title: "Sinal Pago", items: [] as GroupedOrderRow[] },
      quitado: { title: "Quitado", items: [] as GroupedOrderRow[] },
      entregue: { title: "Entregue / Enviado", items: [] as GroupedOrderRow[] },
      cancelado: { title: "Cancelados", items: [] as GroupedOrderRow[] },
    };

    groupedOrders.forEach(item => {
      const { order: o } = item;

      if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") {
        cols.cancelado.items.push(item);
      } else if (o.delivery_status === "entregue" || o.delivery_status === "enviado") {
        cols.entregue.items.push(item);
      } else if (o.payment_status === "quitado") {
        cols.quitado.items.push(item);
      } else if (o.payment_status === "sinal_pago") {
        cols.sinal_pago.items.push(item);
      } else if (o.payment_status === "pronta_entrega" || (isProntaEntrega(o.products) && (o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada"))) {
        cols.pronta_entrega.items.push(item);
      } else if (o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada") {
        cols.sem_sinal.items.push(item);
      } else {
        cols.aguardando_sinal.items.push(item);
      }
    });
    return cols;
  }, [groupedOrders]);

  const toggleSelection = (groupId: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(groupId)) newSet.delete(groupId);
    else newSet.add(groupId);
    setSelectedOrders(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedOrders.size === rows.length && rows.length > 0) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(rows.map(item => item.ids[0])));
    }
  };

  const handleBulkStatus = async (statusType: "payment" | "delivery", newStatus: string) => {
    if (selectedOrders.size === 0) return;
    const allIds: string[] = [];
    selectedOrders.forEach(groupId => {
      const item = rows.find(r => r.ids[0] === groupId);
      if (item) allIds.push(...item.ids);
    });

    if (statusType === "payment") {
      await updateGroup(allIds, { payment_status: newStatus });
      if (newStatus === "cancelado") {
        await supabase.from("order_installments").delete().in("order_id", allIds);
      }
      toast.success(`${selectedOrders.size} reserva(s) atualizada(s)!`);
    } else {
      await updateGroup(allIds, { delivery_status: newStatus });
      if (newStatus === "cancelado") {
        await supabase.from("order_installments").delete().in("order_id", allIds);
      }
      toast.success(`${selectedOrders.size} reserva(s) atualizada(s)!`);
    }
    setSelectedOrders(new Set());
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 panel relative">
        {/* FILTRO POR TIPO DE PEDIDO (PRÉ-VENDA VS PRONTA ENTREGA) */}
        <div className="flex flex-wrap items-center gap-2 p-4 pb-0">
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "todos" ? "default" : "outline"}
            onClick={() => { setCategoryFilter("todos"); setPage(0); }}
            className="h-8 text-xs rounded-lg font-medium"
          >
            Todos ({activeOrdersCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "pre_venda" ? "default" : "outline"}
            onClick={() => { setCategoryFilter("pre_venda"); setPage(0); }}
            className="h-8 text-xs rounded-lg font-medium gap-1.5"
          >
            <Package className="size-3.5 text-amber-500" /> Pré-vendas ({preVendaOrdersCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "pronta_entrega" ? "default" : "outline"}
            onClick={() => { setCategoryFilter("pronta_entrega"); setPage(0); }}
            className={`h-8 text-xs rounded-lg font-medium gap-1.5 ${
              categoryFilter === "pronta_entrega" 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                : "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            }`}
          >
            <Zap className="size-3.5 fill-current text-emerald-500" /> Pronta Entrega ({prontaEntregaOrdersCount})
          </Button>
        </div>

        {/* BARRA DE PESQUISA E FILTROS DE CLIENTE / WHATSAPP / STATUS */}
        <div className="flex flex-col gap-3 border-b border-border/60 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, Nº do pedido (#id), WhatsApp, miniatura..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={(d) => { setStartDate(d); setPage(0); }}
              onEndDateChange={(d) => { setEndDate(d); setPage(0); }}
              onClearFilter={() => { setStartDate(""); setEndDate(""); setPage(0); }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full justify-between">
            <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border/60">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("table")}
                title="Visualização em Tabela"
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("kanban")}
                title="Visualização em Kanban"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const financeiro = prepararDadosExportacaoFinanceira(filteredOrders as any);
                  const csvRows = [
                    ["ID Pedido", "Cliente", "E-mail", "Telefone", "Modelo", "Marca", "Competência", "Status Pagamento", "Status Entrega", "Valor Total (R$)", "Sinal Recebido (R$)", "Saldo Provisionado (R$)"].join(";"),
                    ...financeiro.map((f) =>
                      [f.idPedido, `"${f.clienteNome}"`, `"${f.clienteEmail}"`, `"${f.clienteTelefone}"`, `"${f.produtoModelo}"`, `"${f.produtoMarca}"`, f.competenciaReserva, f.statusPagamento, f.statusEntrega, f.valorTotal, f.valorSinalRecebido, f.saldoProvisionado].join(";")
                    ),
                  ];
                  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Relatório financeiro por competência exportado com sucesso!");
                }}
                className="h-9 text-xs gap-1.5 border-border/80"
              >
                <Download className="size-3.5 text-primary" />
                <span>Exportar Relatório Financeiro</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
            {storeId && (
              <Button
                size="sm"
                onClick={() => setManualDialogOpen(true)}
                className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-xs font-semibold"
              >
                <Plus className="size-4" />
                <span>Nova Reserva</span>
              </Button>
            )}
            <Filter className="size-4 text-muted-foreground ml-1" />
            <Select
              value={paymentFilter}
              onValueChange={(v) => {
                setPaymentFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-[160px] text-xs">
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Qualquer pagamento</SelectItem>
                <SelectItem value="pronta_entrega">Pronta Entrega</SelectItem>
                <SelectItem value="sem_sinal">Sem sinal</SelectItem>
                <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                <SelectItem value="atrasado">Sinal Atrasado</SelectItem>
                <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                <SelectItem value="quitado">Quitado</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={deliveryFilter}
              onValueChange={(v) => {
                setDeliveryFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue placeholder="Envio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Qualquer envio</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="p-0">
          {viewMode === "kanban" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 min-h-[500px] p-4 bg-muted/5">
              {Object.entries(kanbanBoard).map(([statusKey, col]) => (
                <div 
                  key={statusKey} 
                  className="flex flex-col gap-3 w-full bg-muted/20 rounded-xl p-3 border border-border/50"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, statusKey === "entregue" ? "entregue" : statusKey)}
                >
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-semibold text-sm">{col.title}</h3>
                    <Badge variant="secondary" className="text-xs">{col.items.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                    {col.items.map(item => {
                      const { order: o, quantity, ids } = item;
                      const groupId = ids[0];
                      let guestMeta: { name?: string; phone?: string } | null = null;
                      if (o.pix_key && typeof o.pix_key === "string") {
                        if (o.pix_key.startsWith("GUEST:")) {
                          try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
                        } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                          try { guestMeta = JSON.parse(o.pix_key); } catch {}
                        }
                      }
                      const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
                      const displayName =
                        guestMeta?.name ||
                        (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                          ? o.profiles.name
                          : cached?.name) ||
                        (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
                        (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");
                      
                      const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;

                      return (
                        <div 
                          key={groupId} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, item)}
                          className={`bg-card rounded-lg p-3 border shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors ${selectedOrders.has(groupId) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                        >
                          <div className="flex items-start gap-2 mb-2 relative">
                            <div className="absolute -top-1 -right-1 z-10">
                              <Checkbox checked={selectedOrders.has(groupId)} onCheckedChange={() => toggleSelection(groupId)} />
                            </div>
                            <div className="size-10 shrink-0 rounded bg-muted border border-border overflow-hidden">
                               {o.products?.image_url ? (
                                  <img src={o.products.image_url} alt={o.products.model || ""} className="w-full h-full object-cover" />
                               ) : <Package className="size-4 m-auto mt-3 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 mb-0.5">
                                {isProntaEntrega(o.products) ? (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 h-3.5 gap-0.5">
                                    <Zap className="size-2.5 fill-current text-emerald-500" /> Pronta Entrega
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground border-border/80 text-[9px] px-1 py-0 h-3.5 gap-0.5">
                                    <Package className="size-2.5" /> Pré-venda
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs font-semibold leading-tight line-clamp-2">{o.products?.model || "Miniatura"}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{displayName}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-2 border-t border-border/40 pt-2">
                            <span className="text-xs font-semibold">{brl(Number(o.total_price) * quantity)}</span>
                            <div className="flex items-center gap-1">
                              {quantity > 1 && <Badge variant="outline" className="text-[9px] px-1 h-4">{quantity}x</Badge>}
                              {clientPhone && (
                                <OrderWhatsAppDropdown
                                  order={o}
                                  quantity={quantity}
                                  displayName={displayName}
                                  phone={clientPhone}
                                  variant="icon"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {col.items.length === 0 && (
                      <div className="h-full flex items-center justify-center border-2 border-dashed border-border/50 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground text-center">Arraste para cá</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* VISÃO PARA CELULAR (CARDS INDIVIDUAIS COM ESPAÇAMENTO CLARO) */}
              <div ref={parentRef} className="md:hidden bg-muted/20 h-[65dvh] overflow-y-auto px-4">
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize() + 32}px`,
                    width: '100%',
                position: 'relative',
                    marginTop: '16px'
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = rows[virtualRow.index];
                    const { order: o, quantity, ids } = item;
                    const groupId = ids[0];
                    let guestMeta: { name?: string; phone?: string } | null = null;
                    if (o.pix_key && typeof o.pix_key === "string") {
                      if (o.pix_key.startsWith("GUEST:")) {
                        try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
                      } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                        try { guestMeta = JSON.parse(o.pix_key); } catch {}
                      }
                    }
                    const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
                    const displayName =
                      guestMeta?.name ||
                      (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                        ? o.profiles.name
                        : cached?.name) ||
                      (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
                      (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");

                    const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;

                    return (
                      <div 
                        key={virtualRow.key} 
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="pb-4"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-3.5 shadow-sm">
                        {/* Cliente e WhatsApp */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <Checkbox checked={selectedOrders.has(groupId)} onCheckedChange={() => toggleSelection(groupId)} />
                            <div>
                              <p className="font-semibold text-base">{displayName}</p>
                              {o.profiles?.email && !guestMeta && (
                                <p className="text-xs text-muted-foreground">{o.profiles.email}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">#{groupId.slice(0, 8)}</p>
                            </div>
                          </div>
                          <OrderWhatsAppDropdown
                            order={o}
                            quantity={quantity}
                            displayName={displayName}
                            phone={clientPhone}
                            variant="badge"
                          />
                        </div>

                        {/* Produto / Miniatura */}
                        <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-2.5 border border-border/40">
                          <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                            {o.products?.image_url ? (
                              <img
                                src={o.products.image_url}
                                alt={o.products.model || "Miniatura"}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground">
                                <Package className="size-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide flex items-center gap-1.5 flex-wrap">
                              <span>{o.products?.brand}</span>
                              {isProntaEntrega(o.products) ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 h-4 gap-0.5">
                                  <Zap className="size-2.5 fill-current text-emerald-500" /> Pronta Entrega
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground border-border/80 text-[9px] px-1 py-0 h-4 gap-0.5">
                                  <Package className="size-2.5" /> Pré-venda
                                </Badge>
                              )}
                              {quantity > 1 && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-[10px] px-1.5 py-0 border-primary/20">
                                  {quantity}x
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold text-sm truncate flex items-center gap-1">
                              {o.products?.model || "Miniatura"}
                            </p>
                          </div>
                        </div>

                        {/* Valores (Total / Sinal / Saldo) */}
                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/20 p-2.5 text-center text-xs border border-border/30">
                          <div>
                            <p className="text-muted-foreground">Total {o.installment_count && o.installment_count > 1 ? `(${o.installment_count}x)` : ""}</p>
                            <p className="font-semibold text-sm">{brl(Number(o.total_price) * quantity)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Sinal (un.)</p>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <Input
                                className="h-7 w-16 text-center text-xs px-1"
                                type="number"
                                min="0"
                                step="0.01"
                                value={drafts[groupId] ?? String(o.down_payment)}
                                onChange={(e) => setDrafts({ ...drafts, [groupId]: e.target.value })}
                              />
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-7 text-[10px]"
                                onClick={() => updateGroup(ids, { down_payment: Number(drafts[groupId] ?? o.down_payment) })}
                              >
                                OK
                              </Button>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Saldo</p>
                            <p className="font-bold text-sm text-primary">
                              {(() => {
                                const total = Number(o.total_price) * quantity;
                                const sinal = Number(o.down_payment) * quantity;
                                const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid");
                                const totalPaidInsts = paidInsts.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
                                const saldo = Math.max(0, total - sinal - totalPaidInsts);
                                return brl(saldo);
                              })()}
                            </p>
                          </div>
                        </div>

                        {/* Status e Prazo */}
                        {(() => {
                          const currentPaymentStatus = o.payment_status;
                          return (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <PaymentBadge status={currentPaymentStatus} />
                                <Select
                                  value={currentPaymentStatus}
                                  onValueChange={(v) => handlePaymentStatusChange(item, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs w-36">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pronta_entrega">Pronta Entrega</SelectItem>
                                    <SelectItem value="sem_sinal">Sem sinal / Pagar na chegada</SelectItem>
                                    <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                                    <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                                    <SelectItem value="quitado">Quitado</SelectItem>
                                    <SelectItem value="cancelado">Cancelado</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={o.delivery_status}
                                  onValueChange={(v) => handleDeliveryStatusChange(item, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pendente">Pendente</SelectItem>
                                    <SelectItem value="em_transito">Em trânsito</SelectItem>
                                    <SelectItem value="entregue">Entregue</SelectItem>
                                    <SelectItem value="cancelado">Cancelado</SelectItem>
                                  </SelectContent>
                                </Select>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Excluir reserva permanentemente"
                                    onClick={() => handleDeleteGroup(item)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                                <div className="mt-2 flex justify-end">
                                  <OrderInstallmentsDialog
                                      orderId={o.id}
                                      totalPrice={o.total_price * quantity}
                                      installmentCount={o.installment_count}
                                      customerName={guestMeta?.name || o.profiles?.name || "Cliente"}
                                      productName={`${o.products?.brand || ''} ${o.products?.model || ''}`}
                                    />
                                  </div>

                              {currentPaymentStatus === "aguardando_sinal" && o.reservation_expires_at ? (
                                <div className="text-xs">
                                  <Countdown expiresAt={o.reservation_expires_at} />
                                </div>
                              ) : (currentPaymentStatus === "sem_sinal" || currentPaymentStatus === "pagar_na_chegada") && (o.products as any)?.release_date ? (
                                <div className="text-xs text-right">
                                  <span className="font-semibold text-purple-600 dark:text-purple-400 block text-[11px]">Pagar na chegada</span>
                                  <span className="text-muted-foreground font-mono text-[10px]">
                                    {new Date((o.products as any).release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* Código de Rastreio dos Correios (Mobile) */}
                        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                  <Truck className="size-4 text-primary shrink-0" />
                  <Input
                    className="h-8 text-xs font-mono flex-1"
                    placeholder="Cód. Rastreio (Ex: AA123456789BR)"
                    value={trackingDrafts[groupId] ?? o.tracking_code ?? ""}
                    onChange={(e) => setTrackingDrafts({ ...trackingDrafts, [groupId]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs font-medium"
                    onClick={() => handleTrackingSave(ids, trackingDrafts[groupId] ?? o.tracking_code ?? "")}
                  >
                    Salvar
                  </Button>
                  {o.tracking_code && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                        title="Atualizar rastreio automaticamente"
                        onClick={() => handleTrackingUpdate(o.id, o.tracking_code!, o.delivery_status)}
                        disabled={trackingUpdating.has(o.id)}
                      >
                        {trackingUpdating.has(o.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="Abrir no site oficial dos Correios"
                        asChild
                      >
                        <a
                          href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(o.tracking_code)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
              </div>
            );
          })}
          </div>

          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma reserva encontrada.</p>
          )}
        </div>

        {/* VISÃO PARA DESKTOP (TABELA COMPLETA) */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox 
                    checked={rows.length > 0 && selectedOrders.size === rows.length} 
                    onCheckedChange={toggleAllSelection} 
                  />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Miniatura</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Sinal (un.)</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status & Rastreio</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const { order: o, quantity, ids } = item;
                const groupId = ids[0];
                let guestMeta: { name?: string; phone?: string } | null = null;
                if (o.pix_key && typeof o.pix_key === "string") {
                  if (o.pix_key.startsWith("GUEST:")) {
                    try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
                  } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                    try { guestMeta = JSON.parse(o.pix_key); } catch {}
                  }
                }
                const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
                const displayName =
                  guestMeta?.name ||
                  (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                    ? o.profiles.name
                    : cached?.name) ||
                  (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
                  (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");

                const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;
                const currentPaymentStatus = o.payment_status;

                return (
                  <TableRow key={groupId} data-state={selectedOrders.has(groupId) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedOrders.has(groupId)} 
                        onCheckedChange={() => toggleSelection(groupId)} 
                      />
                    </TableCell>
                    <TableCell className="min-w-[150px]">
                      <p className="font-medium">{displayName}</p>
                      {o.profiles?.email && !guestMeta && (
                        <p className="text-[11px] text-muted-foreground">{o.profiles.email}</p>
                      )}
                      <div className="mt-1">
                        <OrderWhatsAppDropdown
                          order={o}
                          quantity={quantity}
                          displayName={displayName}
                          phone={clientPhone}
                          variant="badge"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">#{groupId.slice(0, 8)}</p>
                    </TableCell>
                    <TableCell className="min-w-[250px] max-w-[400px]">
                      <div className="flex items-center gap-3">
                        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                          {o.products?.image_url ? (
                            <img
                              src={o.products.image_url}
                              alt={o.products.model || "Miniatura"}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <Package className="size-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-sm flex items-center gap-1">
                            {o.products?.model || "Miniatura"}
                          </p>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                            <span>{o.products?.brand}</span>
                            {isProntaEntrega(o.products) ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 h-4 gap-0.5">
                                <Zap className="size-2.5 fill-current text-emerald-500" /> Pronta Entrega
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground border-border/80 text-[9px] px-1 py-0 h-4 gap-0.5">
                                <Package className="size-2.5" /> Pré-venda
                              </Badge>
                            )}
                            {quantity > 1 && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-[10px] px-1.5 py-0 border-primary/20">
                                {quantity}x
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {brl(Number(o.total_price) * quantity)}
                      {quantity > 1 && <span className="block text-[10px] text-muted-foreground font-mono">({quantity}x {brl(Number(o.total_price))})</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={drafts[groupId] ?? String(o.down_payment)}
                          onChange={(e) => setDrafts({ ...drafts, [groupId]: e.target.value })}
                        />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          updateGroup(ids, { down_payment: Number(drafts[groupId] ?? o.down_payment) })
                        }
                      >
                        OK
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-primary align-top pt-4">
                    <div className="flex flex-col gap-2 items-start">
                      <span>
                        {(() => {
                          const total = Number(o.total_price) * quantity;
                          const sinal = Number(o.down_payment) * quantity;
                          const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid");
                          const totalPaidInsts = paidInsts.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
                          const saldo = Math.max(0, total - sinal - totalPaidInsts);
                          return brl(saldo);
                        })()}
                      </span>
                      <OrderInstallmentsDialog
                          orderId={o.id}
                          totalPrice={o.total_price * quantity}
                          installmentCount={o.installment_count}
                          customerName={guestMeta?.name || o.profiles?.name || "Cliente"}
                          productName={`${o.products?.brand || ''} ${o.products?.model || ''}`}
                        />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 min-w-[155px]">
                      <PaymentBadge status={currentPaymentStatus} />
                      <Select
                        value={currentPaymentStatus}
                        onValueChange={(v) => handlePaymentStatusChange(item, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pronta_entrega">Pronta Entrega</SelectItem>
                          <SelectItem value="sem_sinal">Sem sinal / Pagar na chegada</SelectItem>
                          <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                          <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                          <SelectItem value="quitado">Quitado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={o.delivery_status}
                        onValueChange={(v) => handleDeliveryStatusChange(item, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_transito">Em trânsito</SelectItem>
                          <SelectItem value="entregue">Entregue</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Campo de Rastreio integrado */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <Input
                          className="h-7 text-[11px] font-mono px-2 w-28"
                          placeholder="Cód. Rastreio"
                          value={trackingDrafts[groupId] ?? o.tracking_code ?? ""}
                          onChange={(e) => setTrackingDrafts({ ...trackingDrafts, [groupId]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px] font-semibold"
                          title="Salvar rastreio"
                          onClick={() => handleTrackingSave(ids, trackingDrafts[groupId] ?? o.tracking_code ?? "")}
                        >
                          OK
                        </Button>
                        {o.tracking_code && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                              title="Atualizar rastreio automaticamente"
                              onClick={() => handleTrackingUpdate(o.id, o.tracking_code!, o.delivery_status)}
                              disabled={trackingUpdating.has(o.id)}
                            >
                              {trackingUpdating.has(o.id) ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Abrir no site oficial dos Correios"
                              asChild
                            >
                              <a
                                href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(o.tracking_code)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title="Excluir reserva"
                          onClick={() => handleDeleteGroup(item)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {o.tracking_code && (
                        <a
                          href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(o.tracking_code)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-mono"
                          title="Rastrear nos Correios"
                        >
                          <span>Rastrear Correios</span>
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {currentPaymentStatus === "aguardando_sinal" && o.reservation_expires_at ? (
                      <Countdown expiresAt={o.reservation_expires_at} />
                    ) : (currentPaymentStatus === "sem_sinal" || currentPaymentStatus === "pagar_na_chegada") && (o.products as any)?.release_date ? (
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">Na chegada</span>
                        <span className="text-muted-foreground font-mono">
                          {new Date((o.products as any).release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma reserva ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        </>
        )}
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </CardContent>
      {storeId && (
        <ManualReservationDialog
          storeId={storeId}
          storeColor={storeColor}
          products={products}
          open={manualDialogOpen}
          onClose={() => setManualDialogOpen(false)}
        />
      )}

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-foreground text-background px-4 py-3 rounded-full shadow-2xl border border-border/10 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 text-xs font-bold text-background">
                {selectedOrders.size}
              </span>
              <span className="text-sm font-medium">selecionadas</span>
            </div>
            <div className="w-px h-6 bg-background/20" />
            <div className="flex items-center gap-2">
              <Select onValueChange={(v) => handleBulkStatus("payment", v)}>
                <SelectTrigger className="h-8 w-[140px] bg-background text-foreground border-transparent text-xs">
                  <SelectValue placeholder="Status Pag..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                  <SelectItem value="quitado">Quitado</SelectItem>
                  <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => handleBulkStatus("delivery", v)}>
                <SelectTrigger className="h-8 w-[140px] bg-background text-foreground border-transparent text-xs">
                  <SelectValue placeholder="Status Envio..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_transito">Em trânsito</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-background hover:bg-background/20 hover:text-background" onClick={() => setSelectedOrders(new Set())}>
              <XCircle className="size-5" />
            </Button>
          </div>
        </div>
      )}

    </Card>
    </div>
  );
}
