import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentBadge } from "@/components/StatusBadge";
import { Package, Copy, MessageCircle, Search, Trophy, Star, Crown, Users, Sparkles, Zap, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCustomerFromCache } from '@/lib/customerCache';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, whatsappLink } from '@/lib/format';
import { OrderInstallmentsDialog } from '@/components/vendedor/OrderInstallmentsDialog';
import { SpreadsheetImporterDialog } from '@/components/vendedor/SpreadsheetImporterDialog';

import type { OrderRow } from '@/components/vendedor/OrderManager';
import { toast } from "sonner";

function getClientTier(totalSpent: number, orderCount: number) {
  if (totalSpent >= 2000 || orderCount >= 10) {
    return {
      name: "Colecionador Diamante",
      level: "diamond",
      color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
      icon: Crown,
    };
  }
  if (totalSpent >= 1000 || orderCount >= 5) {
    return {
      name: "VIP Ouro",
      level: "gold",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: Crown,
    };
  }
  if (totalSpent >= 400 || orderCount >= 3) {
    return {
      name: "VIP Prata",
      level: "silver",
      color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
      icon: Star,
    };
  }
  if (orderCount === 0) {
    return {
      name: "Seguidor",
      level: "follower",
      color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      icon: Users,
    };
  }
  return {
    name: "Bronze",
    level: "bronze",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    icon: Sparkles,
  };
}

export function ClientsTab({ orders, storeId }: { orders: OrderRow[]; storeId?: string }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [itemSearch, setItemSearch] = useState<string>("");
  const [itemStatusFilter, setItemStatusFilter] = useState<string>("active");
  const [whatsappSummaryOpen, setWhatsappSummaryOpen] = useState(false);
  const [summaryClient, setSummaryClient] = useState<any>(null);
  const [includeFullList, setIncludeFullList] = useState(true);

  // Estados para a Baixa Global em Cascata
  const [globalPaymentOpen, setGlobalPaymentOpen] = useState(false);
  const [globalAmount, setGlobalAmount] = useState<string>("");
  const [globalPaymentDate, setGlobalPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [globalStrategy, setGlobalStrategy] = useState<"oldest_first" | "ready_first">("oldest_first");
  const [isProcessingGlobal, setIsProcessingGlobal] = useState(false);

  const [clientNotes, setClientNotes] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("store_client_notes") || localStorage.getItem("crm_client_notes") || "{}");
    } catch {
      return {};
    }
  });
  const [editingNote, setEditingNote] = useState<string>("");

  const [waTemplate, setWaTemplate] = useState(() => {
    return localStorage.getItem("wa_template") || "Olá {{nome}}, tudo bem? Temos novidades em miniaturas colecionáveis na loja!";
  });
  const [configOpen, setConfigOpen] = useState(false);
  const [tempWaTemplate, setTempWaTemplate] = useState(waTemplate);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Buscar dados da loja para Chave PIX e Nome
  const { data: storeData } = useQuery({
    queryKey: ["store-details", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, pix_key, whatsapp_number")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  // Buscar links de clientes que seguem a loja
  const { data: storeLinks } = useQuery({
    queryKey: ["customer-store-links", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_store_link")
        .select("user_id, created_at")
        .eq("store_id", storeId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Obter IDs de todos os usuários (seguidores + compradores)
  const linkUserIds = (storeLinks || []).map((l) => l.user_id);
  const orderUserIds = orders.map((o) => o.user_id);
  const allUserIds = Array.from(new Set([...linkUserIds, ...orderUserIds]));

  // Buscar dados de perfil de todos os clientes
  const { data: profilesData } = useQuery({
    queryKey: ["client-profiles", allUserIds],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, phone, created_at")
        .in("id", allUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  function saveWaTemplate() {
    setWaTemplate(tempWaTemplate);
    localStorage.setItem("wa_template", tempWaTemplate);
    setConfigOpen(false);
    toast.success("Mensagem padrão salva!");
  }

  function handleSaveNote(userId: string) {
    if (!userId) return;
    const updated = { ...clientNotes, [userId]: editingNote };
    setClientNotes(updated);
    localStorage.setItem("store_client_notes", JSON.stringify(updated));
    toast.success("Anotação do cliente salva!");
  }

  const profilesMap = new Map((profilesData || []).map((p) => [p.id, p]));
  const linkDateMap = new Map((storeLinks || []).map((l) => [l.user_id, new Date(l.created_at)]));
  const ordersByUserMap = new Map<string, OrderRow[]>();
  const brandCountMap = new Map<string, number>();

  for (const order of orders) {
    if (!ordersByUserMap.has(order.user_id)) {
      ordersByUserMap.set(order.user_id, []);
    }
    ordersByUserMap.get(order.user_id)!.push(order);

    if (order.payment_status !== "cancelado" && (order as any).delivery_status !== "cancelado") {
      const brand = order.products?.brand;
      if (brand) {
        brandCountMap.set(brand, (brandCountMap.get(brand) || 0) + 1);
      }
    }
  }

  let topBrand = "Nenhuma venda";
  let topBrandCount = 0;
  for (const [brand, count] of brandCountMap.entries()) {
    if (count > topBrandCount) {
      topBrand = brand;
      topBrandCount = count;
    }
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let newClientsThisMonth = 0;

  const allClients = allUserIds.map((userId) => {
    const userOrders = (ordersByUserMap.get(userId) || []).filter(o => o.payment_status !== "cancelado" && (o as any).delivery_status !== "cancelado");
    const dbProfile = profilesMap.get(userId);
    const orderProfile = userOrders.find((o) => o.profiles)?.profiles;
    const cached = getCustomerFromCache(userId);

    const name =
      (dbProfile?.name && dbProfile.name !== "Cliente" && dbProfile.name !== "Cliente cadastrado"
        ? dbProfile.name
        : orderProfile?.name || cached?.name) || "Cliente";
    const email = dbProfile?.email || orderProfile?.email || cached?.email || "";
    const phone = dbProfile?.phone || orderProfile?.phone || cached?.phone || "";

    let totalSpent = 0;
    let totalPaid = 0;
    let totalItems = 0;
    let firstOrderDate: Date | null = null;
    let arrivedCount = 0;
    let preorderCount = 0;
    let shippedCount = 0;
    let deliveredCount = 0;

    for (const order of userOrders) {
      const orderDate = new Date(order.created_at);
      if (!firstOrderDate || orderDate < firstOrderDate) {
        firstOrderDate = orderDate;
      }

      const price = Number(order.total_price || 0);
      totalSpent += price;
      totalItems += 1;

      const signalPaid = (order.payment_status === "sinal_pago" || order.payment_status === "quitado") ? Number(order.down_payment || 0) : 0;
      const paidInsts = (order.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
      const orderPaid = Math.min(price, signalPaid + paidInsts);
      totalPaid += orderPaid;

      const isDelivered = (order as any).delivery_status === "entregue";
      const isShipped = (order as any).delivery_status === "em_transito";
      const releaseDate = (order.products as any)?.release_date;
      const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;

      if (isDelivered) {
        deliveredCount += 1;
      } else if (isShipped) {
        shippedCount += 1;
      } else if (isArrived) {
        arrivedCount += 1;
      } else {
        preorderCount += 1;
      }
    }

    const remainingBalance = Math.max(0, totalSpent - totalPaid);
    const progressPercent = totalSpent > 0 ? Math.min(100, Math.round((totalPaid / totalSpent) * 100)) : 0;

    const followDate = linkDateMap.get(userId) || (dbProfile?.created_at ? new Date(dbProfile.created_at) : new Date());
    const entryDate = firstOrderDate || followDate;

    return {
      userId,
      profile: { id: userId, name, email, phone },
      orders: userOrders,
      totalSpent,
      totalPaid,
      remainingBalance,
      progressPercent,
      totalItems,
      arrivedCount,
      preorderCount,
      shippedCount,
      deliveredCount,
      firstOrderDate: entryDate,
      isFollowerOnly: userOrders.length === 0,
    };
  }).sort((a, b) => b.totalSpent - a.totalSpent);

  for (const client of allClients) {
    if (client.firstOrderDate && client.firstOrderDate.getMonth() === currentMonth && client.firstOrderDate.getFullYear() === currentYear) {
      newClientsThisMonth++;
    }
  }

  const clients = allClients.filter((c) => {
    const tier = getClientTier(c.totalSpent, c.orders.length);
    if (selectedTier !== "all" && tier.level !== selectedTier) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.profile.name || "").toLowerCase();
    const email = (c.profile.email || "").toLowerCase();
    const phone = (c.profile.phone || "").toLowerCase();
    const note = (clientNotes[c.userId] || "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q) || note.includes(q);
  });

  // Atualiza selectedClient quando as orders mudam (para refletir baixas imediatamente)
  const currentSelectedClient = useMemo(() => {
    if (!selectedClient) return null;
    return allClients.find(c => c.userId === selectedClient.userId) || selectedClient;
  }, [allClients, selectedClient]);

  // Simulação da Baixa em Cascata em tempo real
  const cascadeSimulation = useMemo(() => {
    if (!currentSelectedClient) return { items: [], totalDeducted: 0, fullyPaidCount: 0, partialPaidCount: 0, newRemaining: 0 };

    const val = parseFloat(globalAmount.replace(/\./g, "").replace(",", ".")) || 0;
    if (val <= 0) {
      return { items: [], totalDeducted: 0, fullyPaidCount: 0, partialPaidCount: 0, newRemaining: currentSelectedClient.remainingBalance };
    }

    // Filtrar pedidos elegíveis (com saldo a pagar)
    const eligibleOrders = (currentSelectedClient.orders || []).filter((o: OrderRow) => {
      if (o.payment_status === "cancelado" || (o as any).delivery_status === "cancelado") return false;
      const price = Number(o.total_price || 0);
      const signalPaid = (o.payment_status === "sinal_pago" || o.payment_status === "quitado") ? Number(o.down_payment || 0) : 0;
      const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
      const paid = Math.min(price, signalPaid + paidInsts);
      return (price - paid) > 0.01;
    });

    // Ordenar segundo a estratégia
    eligibleOrders.sort((a: OrderRow, b: OrderRow) => {
      if (globalStrategy === "ready_first") {
        const releaseA = (a.products as any)?.release_date;
        const releaseB = (b.products as any)?.release_date;
        const isArrivedA = releaseA ? new Date(releaseA + "T00:00:00") <= now : true;
        const isArrivedB = releaseB ? new Date(releaseB + "T00:00:00") <= now : true;
        if (isArrivedA && !isArrivedB) return -1;
        if (!isArrivedA && isArrivedB) return 1;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    let available = val;
    let totalDeducted = 0;
    let fullyPaidCount = 0;
    let partialPaidCount = 0;
    const items: Array<{
      order: OrderRow;
      orderId: string;
      productName: string;
      productImage: string;
      price: number;
      currentPaid: number;
      currentRemaining: number;
      deducted: number;
      afterRemaining: number;
      willBeQuitado: boolean;
    }> = [];

    for (const order of eligibleOrders) {
      if (available <= 0.001) break;

      const price = Number(order.total_price || 0);
      const signalPaid = (order.payment_status === "sinal_pago" || order.payment_status === "quitado") ? Number(order.down_payment || 0) : 0;
      const paidInsts = (order.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
      const currentPaid = Math.min(price, signalPaid + paidInsts);
      const currentRemaining = Math.max(0, price - currentPaid);

      const toDeduct = Math.min(available, currentRemaining);
      const afterRemaining = Math.max(0, currentRemaining - toDeduct);
      const willBeQuitado = afterRemaining <= 0.01;

      if (willBeQuitado) fullyPaidCount++;
      else partialPaidCount++;

      totalDeducted += toDeduct;
      available -= toDeduct;

      items.push({
        order,
        orderId: order.id,
        productName: `${order.products?.brand || ""} ${order.products?.model || ""}`,
        productImage: order.products?.image_url || "",
        price,
        currentPaid,
        currentRemaining,
        deducted: toDeduct,
        afterRemaining,
        willBeQuitado
      });
    }

    const newRemaining = Math.max(0, currentSelectedClient.remainingBalance - totalDeducted);

    return { items, totalDeducted, fullyPaidCount, partialPaidCount, newRemaining };
  }, [currentSelectedClient, globalAmount, globalStrategy, now]);

  // Executar a Baixa Global em Cascata no Banco
  async function handleConfirmGlobalPayment() {
    if (!cascadeSimulation.items || cascadeSimulation.items.length === 0) {
      toast.error("Informe um valor para realizar a baixa.");
      return;
    }

    try {
      setIsProcessingGlobal(true);
      const dueDate = globalPaymentDate ? new Date(globalPaymentDate + "T12:00:00").toISOString() : new Date().toISOString();

      // Executar as inserções e updates para cada pedido afetado
      for (const item of cascadeSimulation.items) {
        // Remove parcelas pendentes legadas deste pedido para não ficarem duplicadas
        await supabase.from("order_installments").delete().eq("order_id", item.orderId).eq("status", "pending");

        const { data: existingInsts } = await supabase.from("order_installments").select("id").eq("order_id", item.orderId);
        const nextNumber = (existingInsts?.length || 0) + 1;

        // Inserir amortização paga
        const { error: insError } = await supabase.from("order_installments").insert({
          order_id: item.orderId,
          installment_number: nextNumber,
          amount: item.deducted,
          due_date: dueDate,
          status: "paid",
          paid_at: new Date().toISOString()
        });

        if (insError) throw insError;

        // Se o pedido foi quitado, atualizar status
        if (item.willBeQuitado) {
          await supabase.from("orders").update({ payment_status: "quitado" }).eq("id", item.orderId);
        }
      }

      // Invalidar queries do React Query
      await queryClient.invalidateQueries({ queryKey: ["store-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["all_installments"] });
      await queryClient.invalidateQueries({ queryKey: ["order_installments"] });

      toast.success(`Baixa de ${brl(cascadeSimulation.totalDeducted)} concluída! ${cascadeSimulation.fullyPaidCount} miniaturas quitadas.`);
      setGlobalPaymentOpen(false);
      setGlobalAmount("");
    } catch (err: any) {
      toast.error("Erro ao aplicar baixa global: " + (err.message || "Tente novamente"));
    } finally {
      setIsProcessingGlobal(false);
    }
  }

  // Gerador de Extrato Consolidado para o WhatsApp (Focado nas reservas ativas em aberto)
  function generateWhatsAppSummary(client: any, detailed = true) {
    if (!client) return "";
    const name = client.profile.name || "Cliente";
    const storeName = storeData?.name || "Nossa Loja";
    const pixKey = storeData?.pix_key ? `\n🔑 *Chave PIX da loja:* ${storeData.pix_key}` : "";

    // Filtra apenas pedidos em aberto / não entregues para não poluir o extrato
    const activeOrders = (client.orders || []).filter(
      (o: OrderRow) => o.payment_status !== "cancelado" && (o as any).delivery_status !== "cancelado" && (o as any).delivery_status !== "entregue"
    );

    let activeSpent = 0;
    let activePaid = 0;
    let activeArrived = 0;
    let activePreorder = 0;
    let activeShipped = 0;

    for (const order of activeOrders) {
      const price = Number(order.total_price || 0);
      activeSpent += price;

      const signalPaid = (order.payment_status === "sinal_pago" || order.payment_status === "quitado") ? Number(order.down_payment || 0) : 0;
      const paidInsts = (order.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
      const orderPaid = Math.min(price, signalPaid + paidInsts);
      activePaid += orderPaid;

      const isShipped = (order as any).delivery_status === "em_transito";
      const releaseDate = (order.products as any)?.release_date;
      const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;

      if (isShipped) {
        activeShipped += 1;
      } else if (isArrived) {
        activeArrived += 1;
      } else {
        activePreorder += 1;
      }
    }

    const activeRemaining = Math.max(0, activeSpent - activePaid);
    const activeProgress = activeSpent > 0 ? Math.min(100, Math.round((activePaid / activeSpent) * 100)) : 100;

    let text = `Olá *${name}*! 🏎️💨\n\n`;
    text += `Passando para enviar o resumo atualizado do seu acervo / reservas em aberto na *${storeName}*:\n\n`;
    text += `📊 *RESUMO DAS RESERVAS ATIVAS:*\n`;
    text += `• Miniaturas em Aberto: *${activeOrders.length} peças*\n`;
    text += `• Valor Total em Aberto: *${brl(activeSpent)}*\n`;
    text += `• Total Já Pago: *${brl(activePaid)}* (${activeProgress}%)\n`;
    text += `• Saldo Restante a Pagar: *${brl(activeRemaining)}*\n\n`;

    text += `📦 *STATUS DA SUA CAIXA:*\n`;
    if (activeArrived > 0) text += `• 🟢 *${activeArrived}* já na loja (Prontas para envio)\n`;
    if (activePreorder > 0) text += `• ⏳ *${activePreorder}* em pré-venda (Aguardando lançamento)\n`;
    if (activeShipped > 0) text += `• 🚚 *${activeShipped}* em trânsito a caminho\n`;
    if (client.deliveredCount > 0) text += `• ✓ *${client.deliveredCount}* já entregues anteriormente\n`;

    if (detailed && activeOrders.length > 0) {
      text += `\n📋 *DETALHAMENTO DOS MODELOS ATIVOS:*\n`;
      activeOrders.forEach((o: OrderRow, idx: number) => {
        const brand = o.products?.brand || "";
        const model = o.products?.model || "Miniatura";
        const statusPag = o.payment_status === "quitado" ? "✓ Quitado" : o.payment_status === "sinal_pago" ? "🟡 Sinal Pago" : "⏳ Pendente";
        const isShipped = (o as any).delivery_status === "em_transito";
        const releaseDate = (o.products as any)?.release_date;
        const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;
        const statusLog = isShipped ? "🚚 Em Trânsito" : isArrived ? "📦 Na Loja" : "⏳ Pré-venda";

        text += `${idx + 1}. *${brand} ${model}* - ${brl(Number(o.total_price))} (${statusPag} | ${statusLog})\n`;
      });
    }

    text += `${pixKey}\n\nQualquer dúvida ou quando quiser solicitar o despacho das miniaturas prontas, é só nos avisar! Muito obrigado pela parceria! 🏁`;
    return text;
  }

  function handleOpenWhatsAppSummary(client: any) {
    setSummaryClient(client);
    setWhatsappSummaryOpen(true);
  }

  // Filtragem interna das reservas do cliente selecionado
  const filteredClientOrders = useMemo(() => {
    if (!currentSelectedClient?.orders) return [];
    return currentSelectedClient.orders.filter((order: OrderRow) => {
      if (order.payment_status === "cancelado" || (order as any).delivery_status === "cancelado") return false;

      // Filtro de texto
      if (itemSearch) {
        const q = itemSearch.toLowerCase();
        const brand = (order.products?.brand || "").toLowerCase();
        const model = (order.products?.model || "").toLowerCase();
        const track = (order.tracking_code || "").toLowerCase();
        if (!brand.includes(q) && !model.includes(q) && !track.includes(q)) return false;
      }

      // Filtro de status
      if (itemStatusFilter === "all") return true;
      if (itemStatusFilter === "active") {
        return (order as any).delivery_status !== "entregue";
      }
      if (itemStatusFilter === "arrived") {
        const releaseDate = (order.products as any)?.release_date;
        const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;
        return isArrived && (order as any).delivery_status === "pendente";
      }
      if (itemStatusFilter === "preorder") {
        const releaseDate = (order.products as any)?.release_date;
        const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;
        return !isArrived && (order as any).delivery_status === "pendente";
      }
      if (itemStatusFilter === "delivered") {
        return (order as any).delivery_status === "entregue";
      }
      if (itemStatusFilter === "pending_payment") {
        return order.payment_status !== "quitado" && (order as any).delivery_status !== "entregue";
      }
      if (itemStatusFilter === "paid") {
        return order.payment_status === "quitado";
      }
      return true;
    });
  }, [currentSelectedClient, itemSearch, itemStatusFilter]);

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Cards de Métricas Top */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 mb-2">
        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="size-4 text-amber-500 shrink-0" />
              <span>Marca Mais Vendida</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-bold truncate">{topBrand}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {topBrandCount === 0 ? "Nenhuma reserva confirmada" : `${topBrandCount} reservas no total`}
            </p>
          </CardContent>
        </Card>

        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="size-4 text-blue-500 shrink-0" />
              <span>Novos Clientes (Mês)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-500">+{newClientsThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-1">cadastros realizados este mês</p>
          </CardContent>
        </Card>

        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="size-4 text-yellow-500 shrink-0" />
              <span>Top Clientes Colecionadores</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {allClients.slice(0, 3).map((c, i) => (
                <div key={c.userId} className="flex justify-between text-xs">
                  <span className="truncate max-w-[140px] font-medium">{i + 1}. {c.profile.name}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-500">{brl(c.totalSpent)}</span>
                </div>
              ))}
              {allClients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente registrado</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela / Grid de Clientes */}
      <Card className="panel border-border/60">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="size-5 text-primary" />
              Base de Clientes & Colecionadores
            </CardTitle>
            <CardDescription className="text-xs">
              Gerencie acervos de alto volume, saldos devedores, baixas em cascata e envie extratos detalhados.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, WhatsApp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            {storeId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportDialogOpen(true)}
                className="text-xs h-9 gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
              >
                <FileSpreadsheet className="size-3.5" />
                Importar Planilha
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(true)}
              className="text-xs h-9 gap-1.5"
            >
              <MessageCircle className="size-3.5" />
              Configurar Mensagem
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6">
          {clients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum cliente encontrado com os filtros selecionados.
            </div>
          ) : (
            <>
              {/* VISUALIZAÇÃO MOBILE (CARDS RESPONSIVOS) */}
              <div className="space-y-3 md:hidden">
                {clients.map((c) => {
                  const tier = getClientTier(c.totalSpent, c.orders.length);
                  const TierIcon = tier.icon;

                  return (
                    <div
                      key={c.userId}
                      className="rounded-xl border border-border/60 bg-card p-3.5 space-y-3 shadow-sm"
                    >
                      {/* Header do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-foreground truncate">{c.profile.name || "Cliente"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.totalItems > 0 ? `${c.totalItems} miniaturas reservadas` : "Seguindo a loja"}
                          </p>
                        </div>
                        <Badge variant="outline" className={`gap-1 font-semibold shrink-0 text-[10px] py-0.5 ${tier.color}`}>
                          <TierIcon className="size-3" />
                          {tier.name}
                        </Badge>
                      </div>

                      {/* Contato */}
                      {c.profile.phone && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 px-2.5 py-1.5 rounded-lg border border-border/30">
                          <span className="font-mono text-[11px]">{c.profile.phone}</span>
                          <a
                            href={whatsappLink(c.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, c.profile.name || "Cliente"))}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 text-[11px]"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      )}

                      {/* Resumo Financeiro Mobile */}
                      <div className="space-y-1.5 bg-muted/30 p-2.5 rounded-lg border border-border/30">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Total Acervo ({c.totalItems} pcs):</span>
                          <span className="font-bold text-foreground">{brl(c.totalSpent)}</span>
                        </div>
                        <Progress value={c.progressPercent} className="h-1.5" />
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Pago: {brl(c.totalPaid)} ({c.progressPercent}%)
                          </span>
                          {c.remainingBalance > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              Falta: {brl(c.remainingBalance)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              ✓ Quitado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações Mobile */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {c.totalItems > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => handleOpenWhatsAppSummary(c)}
                          >
                            <MessageCircle className="size-3.5" />
                            Extrato
                          </Button>
                        )}

                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => {
                            setSelectedClient(c);
                            setEditingNote(clientNotes[c.userId] || "");
                          }}
                        >
                          Ver histórico
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VISUALIZAÇÃO DESKTOP (TABELA) */}
              <div className="hidden md:block rounded-xl border border-border/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-xs">
                      <TableHead>Cliente / Perfil</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-center">Acervo (Peças)</TableHead>
                      <TableHead>Resumo Financeiro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => {
                      const tier = getClientTier(c.totalSpent, c.orders.length);
                      const TierIcon = tier.icon;

                      return (
                        <TableRow key={c.userId} className="text-sm">
                          <TableCell className="font-medium">
                            <p className="font-semibold text-foreground">{c.profile.name || "Cliente"}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.totalItems > 0 ? `${c.totalItems} miniaturas reservadas` : "Seguindo a loja"}
                            </p>
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline" className={`gap-1 font-semibold text-[11px] ${tier.color}`}>
                              <TierIcon className="size-3" />
                              {tier.name}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col text-xs text-muted-foreground">
                              <span>{c.profile.phone || "-"}</span>
                              <span>{c.profile.email || ""}</span>
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <Badge variant="secondary" className="font-bold text-xs">
                              {c.totalItems} pcs
                            </Badge>
                            {c.arrivedCount > 0 && (
                              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                                {c.arrivedCount} na loja 📦
                              </span>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1 min-w-[170px]">
                              <div className="flex justify-between text-xs">
                                <span className="font-bold text-foreground">{brl(c.totalSpent)}</span>
                                <span className="text-[11px] text-muted-foreground">{c.progressPercent}%</span>
                              </div>
                              <Progress value={c.progressPercent} className="h-1.5" />
                              <div className="flex justify-between text-[11px]">
                                <span className="text-emerald-600 dark:text-emerald-400">Pago: {brl(c.totalPaid)}</span>
                                {c.remainingBalance > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold">Falta: {brl(c.remainingBalance)}</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ 100% Quitado</span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {c.totalItems > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                  onClick={() => handleOpenWhatsAppSummary(c)}
                                  title="Gerar extrato completo para o WhatsApp"
                                >
                                  <MessageCircle className="size-3.5" />
                                  <span className="hidden sm:inline">Extrato</span>
                                </Button>
                              )}

                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setSelectedClient(c);
                                  setEditingNote(clientNotes[c.userId] || "");
                                }}
                              >
                                Ver histórico
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* DIALOG DE DETALHES DO ACERVO DO CLIENTE */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="w-[98vw] sm:w-[95vw] max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-3.5 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader className="shrink-0 space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base sm:text-xl font-bold flex items-center gap-2">
                  Acervo: {currentSelectedClient?.profile?.name || "Cliente"}
                </DialogTitle>
                {currentSelectedClient && (() => {
                  const tier = getClientTier(currentSelectedClient.totalSpent, currentSelectedClient.orders.length);
                  const TierIcon = tier.icon;
                  return (
                    <Badge variant="outline" className={`gap-1 font-semibold text-[10px] sm:text-xs py-0.5 ${tier.color}`}>
                      <TierIcon className="size-3" />
                      {tier.name}
                    </Badge>
                  );
                })()}
              </div>

              {currentSelectedClient?.totalItems > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {currentSelectedClient?.remainingBalance > 0 && (
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm font-semibold"
                      onClick={() => {
                        setGlobalAmount("");
                        setGlobalPaymentOpen(true);
                      }}
                    >
                      <Zap className="size-3.5 fill-current" />
                      Abater Pagamento Global
                    </Button>
                  )}

                  <Button
                    size="sm"
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={() => handleOpenWhatsAppSummary(currentSelectedClient)}
                  >
                    <MessageCircle className="size-3.5" />
                    Enviar Extrato
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              WhatsApp: <span className="font-semibold text-foreground">{currentSelectedClient?.profile?.phone || "Não informado"}</span> &bull; Email: {currentSelectedClient?.profile?.email || "-"}
            </p>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pr-0.5">
            {/* CARDS DE RESUMO DO ACERVO GERAL */}
            {currentSelectedClient && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card className="border-border/60 bg-muted/20">
                  <CardContent className="p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block">Total de Miniaturas</span>
                    <span className="text-base sm:text-lg font-bold text-foreground">{currentSelectedClient.totalItems} peças</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">{brl(currentSelectedClient.totalSpent)}</span>
                  </CardContent>
                </Card>

                <Card className="border-emerald-500/30 bg-emerald-500/10">
                  <CardContent className="p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 block">Total Já Pago</span>
                    <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">{brl(currentSelectedClient.totalPaid)}</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">{currentSelectedClient.progressPercent}% quitado</span>
                  </CardContent>
                </Card>

                <Card className={`border ${currentSelectedClient.remainingBalance > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
                  <CardContent className="p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] block">{currentSelectedClient.remainingBalance > 0 ? "Saldo Restante" : "Status Financeiro"}</span>
                    <span className="text-base sm:text-lg font-bold truncate block">
                      {currentSelectedClient.remainingBalance > 0 ? brl(currentSelectedClient.remainingBalance) : "100% Quitado"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
                      {currentSelectedClient.remainingBalance > 0 ? "a receber no total" : "todas as peças pagas"}
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/20">
                  <CardContent className="p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block">Logística</span>
                    <div className="flex flex-col text-[11px] sm:text-xs font-semibold mt-1 gap-0.5">
                      <span className="text-emerald-600 dark:text-emerald-400">📦 {currentSelectedClient.arrivedCount} na loja</span>
                      <span className="text-muted-foreground">⏳ {currentSelectedClient.preorderCount} pré-venda</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* SEÇÃO DE ANOTAÇÕES */}
            <div className="space-y-2 rounded-xl border border-border/50 bg-background/50 p-2.5 sm:p-3">
              <div className="flex justify-between items-center">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Anotações do Cliente
                </Label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-6 px-2"
                  onClick={() => currentSelectedClient && handleSaveNote(currentSelectedClient.userId)}
                >
                  Salvar
                </Button>
              </div>
              <Textarea
                placeholder="Ex: Colecionador focado em JDM e RLC..."
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>

            {/* FILTROS E BUSCA DE RESERVAS */}
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant={itemStatusFilter === "active" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2 font-semibold"
                    onClick={() => setItemStatusFilter("active")}
                  >
                    Em Aberto ({((currentSelectedClient?.orders || []).filter((o: any) => o.delivery_status !== 'entregue')).length})
                  </Button>
                  <Button
                    variant={itemStatusFilter === "arrived" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2 text-emerald-600"
                    onClick={() => setItemStatusFilter("arrived")}
                  >
                    Na Loja ({currentSelectedClient?.arrivedCount || 0})
                  </Button>
                  <Button
                    variant={itemStatusFilter === "preorder" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setItemStatusFilter("preorder")}
                  >
                    Pré-venda ({currentSelectedClient?.preorderCount || 0})
                  </Button>
                  {currentSelectedClient?.deliveredCount > 0 && (
                    <Button
                      variant={itemStatusFilter === "delivered" ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2 text-blue-600 dark:text-blue-400"
                      onClick={() => setItemStatusFilter("delivered")}
                    >
                      Entregues ({currentSelectedClient?.deliveredCount || 0})
                    </Button>
                  )}
                  <Button
                    variant={itemStatusFilter === "all" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setItemStatusFilter("all")}
                  >
                    Todas ({currentSelectedClient?.orders?.length || 0})
                  </Button>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar modelo, marca..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="pl-8 text-xs h-8"
                  />
                </div>
              </div>

              {/* LISTA DE RESERVAS DO CLIENTE */}
              {filteredClientOrders.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs border border-dashed rounded-xl">
                  Nenhuma miniatura encontrada com os filtros atuais.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredClientOrders.map((order: OrderRow) => {
                    const price = Number(order.total_price || 0);
                    const signalPaid = (order.payment_status === "sinal_pago" || order.payment_status === "quitado") ? Number(order.down_payment || 0) : 0;
                    const paidInsts = (order.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
                    const itemPaid = Math.min(price, signalPaid + paidInsts);
                    const itemRemaining = Math.max(0, price - itemPaid);
                    const releaseDate = (order.products as any)?.release_date;
                    const isArrived = releaseDate ? new Date(releaseDate + "T00:00:00") <= now : true;

                    return (
                      <div
                        key={order.id}
                        className="border border-border/60 rounded-xl p-2.5 sm:p-3 flex flex-col gap-2.5 bg-card shadow-sm hover:border-primary/40 transition-colors w-full overflow-hidden"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 w-full">
                          {order.products?.image_url ? (
                            <img src={order.products.image_url} alt="Miniatura" className="size-11 sm:size-12 rounded-lg object-cover border border-border/40 shrink-0" />
                          ) : (
                            <div className="size-11 sm:size-12 bg-muted rounded-lg flex items-center justify-center text-muted-foreground shrink-0">
                              <Package className="size-5 sm:size-6" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                              <span className="break-words leading-tight">{order.products?.brand || "Marca"} {order.products?.model || "Miniatura"}</span>
                              {isArrived ? (
                                <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 py-0 h-4 shrink-0">
                                  Na Loja 📦
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground py-0 h-4 shrink-0">
                                  Pré-venda ⏳
                                </Badge>
                              )}
                            </div>

                            <div className="text-[11px] sm:text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 items-center mt-1">
                              <span>Reserva: {new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
                              <span>• Valor: <strong className="text-foreground">{brl(price)}</strong></span>
                              {itemPaid > 0 && <span className="text-emerald-600 dark:text-emerald-400">• Pago: {brl(itemPaid)}</span>}
                              {itemRemaining > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">• Saldo: {brl(itemRemaining)}</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">• Quitado</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Linha de Ação e Status do Item */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 w-full">
                          <div className="shrink-0">
                            <PaymentBadge status={order.payment_status} />
                          </div>
                          <div className="shrink-0">
                            <OrderInstallmentsDialog
                              orderId={order.id}
                              totalPrice={price}
                              installmentCount={order.installment_count}
                              customerName={currentSelectedClient.profile.name || "Cliente"}
                              productName={`${order.products?.brand || ''} ${order.products?.model || ''}`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE BAIXA GLOBAL EM CASCATA (FIFO) */}
      <Dialog open={globalPaymentOpen} onOpenChange={setGlobalPaymentOpen}>
        <DialogContent className="w-[96vw] max-w-lg max-h-[92vh] flex flex-col overflow-hidden p-4 sm:p-6 gap-4">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="size-5 text-amber-500 fill-current" />
              Abater Pagamento Global (Cascata)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe o valor enviado pelo cliente. O sistema quita as reservas automaticamente na ordem selecionada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-0.5">
            {/* Resumo Atual do Cliente */}
            <div className="bg-muted/30 p-3 rounded-xl border border-border/40 flex justify-between items-center text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Cliente</span>
                <span className="font-bold text-foreground text-sm">{currentSelectedClient?.profile?.name}</span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block text-[11px]">Saldo Devedor Atual</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                  {currentSelectedClient ? brl(currentSelectedClient.remainingBalance) : "-"}
                </span>
              </div>
            </div>

            {/* Formulário de Entrada */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Valor Recebido (R$)</Label>
                  <Input
                    placeholder="Ex: 1500,00"
                    value={globalAmount}
                    onChange={(e) => setGlobalAmount(e.target.value)}
                    className="font-bold text-sm"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={globalPaymentDate}
                    onChange={(e) => setGlobalPaymentDate(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {/* Atalhos Rápidos */}
              {currentSelectedClient && (
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setGlobalAmount(currentSelectedClient.remainingBalance.toFixed(2).replace(".", ","))}
                  >
                    Quitar Tudo ({brl(currentSelectedClient.remainingBalance)})
                  </Button>
                  {[200, 500, 1000, 2000].map((sug) => (
                    <Button
                      key={sug}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setGlobalAmount(sug.toString())}
                    >
                      +{brl(sug)}
                    </Button>
                  ))}
                </div>
              )}

              {/* Estratégia de Prioridade */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-semibold">Ordem de Baixa</Label>
                <Select value={globalStrategy} onValueChange={(val: any) => setGlobalStrategy(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oldest_first">
                      📅 Mais Antigas Primeiro (Padrão / FIFO)
                    </SelectItem>
                    <SelectItem value="ready_first">
                      📦 Prontas na Loja Primeiro (Liberar envio)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Simulação em Tempo Real */}
            {cascadeSimulation.items.length > 0 ? (
              <div className="space-y-2.5 bg-card border border-emerald-500/30 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" />
                    Resultado da Baixa Automática
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {brl(cascadeSimulation.totalDeducted)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/30 p-2 rounded-lg text-center">
                    <span className="text-[10px] text-muted-foreground block">Miniaturas Quitadas</span>
                    <span className="font-bold text-emerald-600 text-sm">
                      {cascadeSimulation.fullyPaidCount} peças
                    </span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded-lg text-center">
                    <span className="text-[10px] text-muted-foreground block">Novo Saldo Devedor</span>
                    <span className="font-bold text-foreground text-sm">
                      {brl(cascadeSimulation.newRemaining)}
                    </span>
                  </div>
                </div>

                {/* Lista prévia das miniaturas contempladas */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Miniaturas que receberão baixa:
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {cascadeSimulation.items.map((item, idx) => (
                      <div
                        key={item.orderId}
                        className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20 border border-border/30"
                      >
                        <div className="truncate flex-1 min-w-0 pr-2">
                          <span className="font-medium text-foreground block truncate">
                            {idx + 1}. {item.productName}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Saldo anterior: {brl(item.currentRemaining)} &rarr; {item.willBeQuitado ? "Quitado ✓" : `Resta ${brl(item.afterRemaining)}`}
                          </span>
                        </div>
                        <Badge
                          variant={item.willBeQuitado ? "default" : "secondary"}
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${item.willBeQuitado ? "bg-emerald-600 text-white" : ""}`}
                        >
                          -{brl(item.deducted)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              globalAmount && (
                <div className="text-center py-4 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                  Nenhum pedido com saldo pendente para abater.
                </div>
              )
            )}
          </div>

          {/* Rodapé de Ações */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setGlobalPaymentOpen(false)}
              disabled={isProcessingGlobal}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              onClick={handleConfirmGlobalPayment}
              disabled={isProcessingGlobal || cascadeSimulation.items.length === 0}
            >
              <CheckCircle2 className="size-3.5" />
              {isProcessingGlobal ? "Processando..." : `Confirmar Baixa (${brl(cascadeSimulation.totalDeducted)})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE EXTRATO CONSOLIDADO DO WHATSAPP */}
      <Dialog open={whatsappSummaryOpen} onOpenChange={setWhatsappSummaryOpen}>
        <DialogContent className="w-[95vw] max-w-xl p-6 gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <MessageCircle className="size-5 text-emerald-600" />
              Extrato para WhatsApp: {summaryClient?.profile?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Resumo completo e profissional para prestar contas e alinhar pagamentos com o cliente.
            </DialogDescription>
          </DialogHeader>

          {summaryClient && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg text-xs">
                <span className="font-semibold text-foreground">Incluir lista de todos os modelos?</span>
                <Button
                  variant={includeFullList ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIncludeFullList(!includeFullList)}
                >
                  {includeFullList ? "✓ Sim (Completo)" : "Apenas Resumo"}
                </Button>
              </div>

              <Textarea
                readOnly
                value={generateWhatsAppSummary(summaryClient, includeFullList)}
                rows={12}
                className="text-xs font-mono bg-muted/30 select-all"
              />

              <div className="flex justify-between items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-9"
                  onClick={() => {
                    const msg = generateWhatsAppSummary(summaryClient, includeFullList);
                    navigator.clipboard.writeText(msg);
                    toast.success("Extrato copiado para a área de transferência!");
                  }}
                >
                  <Copy className="size-3.5" />
                  Copiar Texto
                </Button>

                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    const msg = generateWhatsAppSummary(summaryClient, includeFullList);
                    const link = whatsappLink(summaryClient.profile.phone, msg);
                    window.open(link, "_blank");
                  }}
                >
                  <MessageCircle className="size-3.5" />
                  Abrir no WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIGURAÇÃO DE MENSAGEM PADRÃO */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="w-[95vw] max-w-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Mensagem Padrão do WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 sm:py-4">
            <div className="space-y-2">
              <Label>Texto da Mensagem</Label>
              <Textarea 
                value={tempWaTemplate}
                onChange={(e) => setTempWaTemplate(e.target.value)}
                placeholder="Olá {{nome}}, tudo bem?"
                rows={4}
                className="text-xs sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use <strong>{`{{nome}}`}</strong> para inserir o nome do cliente automaticamente na mensagem.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveWaTemplate}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {storeId && (
        <SpreadsheetImporterDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          storeId={storeId}
        />
      )}
    </div>
  );
}
