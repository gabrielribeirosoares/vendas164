import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentBadge } from "@/components/StatusBadge";
import { Package } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCustomerFromCache } from '@/lib/customerCache';
import { Search, Trophy, Star, MessageCircle, Crown, Sparkles, Users, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { brl, whatsappLink } from '@/lib/format';

import type { OrderRow } from '@/components/vendedor/OrderManager';
import { toast } from "sonner";

function getClientTier(totalSpent: number, orderCount: number) {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<any>(null);
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
    const userOrders = ordersByUserMap.get(userId) || [];
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
    let firstOrderDate: Date | null = null;

    for (const order of userOrders) {
      const orderDate = new Date(order.created_at);
      if (!firstOrderDate || orderDate < firstOrderDate) {
        firstOrderDate = orderDate;
      }
      if (order.payment_status !== "cancelado" && (order as any).delivery_status !== "cancelado") {
        totalSpent += Number(order.total_price || 0);
      }
    }

    const followDate = linkDateMap.get(userId) || (dbProfile?.created_at ? new Date(dbProfile.created_at) : new Date());
    const entryDate = firstOrderDate || followDate;

    return {
      userId,
      profile: { id: userId, name, email, phone },
      orders: userOrders,
      totalSpent,
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
              <span>Top 3 Clientes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 mt-1">
            {allClients.slice(0, 3).map((c, i) => {
              const tier = getClientTier(c.totalSpent, c.orders.length);
              const TierIcon = tier.icon;
              return (
                <div key={c.userId || i} className="flex justify-between items-center text-xs gap-2 min-w-0">
                  <span className="truncate font-medium flex items-center gap-1 min-w-0">
                    <TierIcon className="size-3 text-amber-500 shrink-0" />
                    <span className="truncate">{i + 1}. {c.profile.name || "Desconhecido"}</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-500 font-semibold shrink-0">{brl(c.totalSpent)}</span>
                </div>
              );
            })}
            {allClients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente ainda</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="panel border-border/60 w-full max-w-full overflow-hidden">
        <CardHeader className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span>Gestão de Clientes</span>
              <Badge variant="secondary" className="text-xs">{allClients.length}</Badge>
            </CardTitle>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, contato ou nota..."
                  className="pl-9 text-xs sm:text-sm h-9"
                  value={searchQuery}
                  onChange={(e: any) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const csvRows = [
                      ["Cliente", "WhatsApp", "Email", "Nível Fidelidade", "Qtd Pedidos", "Total Comprado (R$)", "Data", "Notas"].join(";"),
                      ...clients.map((c) => {
                        const tier = getClientTier(c.totalSpent, c.orders.length);
                        const name = c.profile.name || "Cliente";
                        const phone = c.profile.phone || "";
                        const email = c.profile.email || "";
                        const firstDate = c.firstOrderDate ? new Date(c.firstOrderDate).toLocaleDateString("pt-BR") : "";
                        const note = (clientNotes[c.userId] || "").replace(/"/g, '""');
                        return [
                          `"${name}"`,
                          `"${phone}"`,
                          `"${email}"`,
                          `"${tier.name}"`,
                          c.orders.length,
                          c.totalSpent.toFixed(2),
                          firstDate,
                          `"${note}"`,
                        ].join(";");
                      }),
                    ];
                    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `clientes-loja-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Relatório de clientes exportado!");
                  }}
                  title="Exportar clientes para CSV"
                  className="h-9 px-2.5 sm:px-3 gap-1.5 border-border/80 text-xs flex-1 sm:flex-initial"
                >
                  <Download className="size-3.5 text-primary shrink-0" />
                  <span>Exportar CSV</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTempWaTemplate(waTemplate); setConfigOpen(true); }}
                  title="Configurar Mensagem WhatsApp"
                  className="h-9 px-2.5 sm:px-3 gap-1.5 text-xs flex-1 sm:flex-initial"
                >
                  <MessageCircle className="size-3.5 text-emerald-500 shrink-0" />
                  <span>Template Whats</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Filtro por Nível de Fidelidade */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground mr-1">Filtro de Fidelidade:</span>
            {[
              { id: "all", label: "Todos" },
              { id: "gold", label: "👑 VIP Ouro" },
              { id: "silver", label: "⭐ VIP Prata" },
              { id: "bronze", label: "🌟 Bronze" },
              { id: "follower", label: "👥 Seguidores" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedTier(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  selectedTier === f.id
                    ? "bg-primary text-primary-foreground font-semibold border-primary shadow-sm"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/60 border-border/40"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6 pt-0">
          {clients.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs sm:text-sm">
              {searchQuery ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente encontrado ainda."}
            </div>
          ) : (
            <>
              {/* VISUALIZAÇÃO MOBILE (CARDS OTIMIZADOS) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {clients.map((c) => {
                  const userId = c.userId;
                  const tier = getClientTier(c.totalSpent, c.orders.length);
                  const TierIcon = tier.icon;
                  const note = clientNotes[userId] || "";

                  return (
                    <div
                      key={userId}
                      className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{c.profile.name || "Desconhecido"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.orders.length > 0 ? "Cliente desde" : "Seguindo desde"} {c.firstOrderDate.toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <Badge variant="outline" className={`gap-1 font-semibold shrink-0 text-[11px] ${tier.color}`}>
                          <TierIcon className="size-3" />
                          {tier.name}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                        <div>
                          <span className="text-muted-foreground text-[11px] block">Total comprado:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-500 text-sm">
                            {brl(c.totalSpent)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-muted-foreground text-[11px] block">Reservas:</span>
                          <Badge variant="secondary" className="text-xs">{c.orders.length} pedidos</Badge>
                        </div>
                      </div>

                      {c.profile.phone && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg">
                          <span className="truncate">{c.profile.phone}</span>
                          <a
                            href={whatsappLink(c.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, c.profile.name || "Cliente"))}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 shrink-0 bg-emerald-500/10 px-2 py-1 rounded"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      )}

                      {note && (
                        <p className="text-xs text-muted-foreground italic line-clamp-2 bg-muted/10 p-2 rounded border border-border/30">
                          "{note}"
                        </p>
                      )}

                      <div className="pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs h-8"
                          onClick={() => {
                            setSelectedClient(c);
                            setEditingNote(clientNotes[userId] || "");
                          }}
                        >
                          Ver perfil e histórico
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VISUALIZAÇÃO DESKTOP (TABELA) */}
              <div className="hidden md:block rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Nível & Fidelidade</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-center">Reservas</TableHead>
                      <TableHead>Total Gasto</TableHead>
                      <TableHead className="min-w-[150px]">Anotações</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => {
                      const userId = c.userId;
                      const tier = getClientTier(c.totalSpent, c.orders.length);
                      const TierIcon = tier.icon;
                      const note = clientNotes[userId] || "";

                      return (
                        <TableRow key={userId}>
                          <TableCell className="font-medium">
                            <p className="font-semibold">{c.profile.name || "Desconhecido"}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {c.orders.length > 0 ? "Cliente desde" : "Seguindo desde"} {c.firstOrderDate.toLocaleDateString("pt-BR")}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 font-semibold ${tier.color}`}>
                              <TierIcon className="size-3" />
                              {tier.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col text-xs text-muted-foreground">
                              <span>{c.profile.email || "-"}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span>{c.profile.phone || "-"}</span>
                                {c.profile.phone && (
                                  <a
                                    href={whatsappLink(c.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, c.profile.name || "Cliente"))}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-600 hover:text-emerald-700 hover:scale-110 transition-transform bg-emerald-500/10 p-1 rounded-md flex-shrink-0"
                                    title="Chamar no WhatsApp com mensagem padrão"
                                  >
                                    <MessageCircle className="size-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{c.orders.length}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-emerald-600 dark:text-emerald-500">
                            {brl(c.totalSpent)}
                          </TableCell>
                          <TableCell>
                            {note ? (
                              <p className="text-xs text-muted-foreground line-clamp-2 italic" title={note}>
                                "{note}"
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">Sem anotações</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedClient(c);
                                setEditingNote(clientNotes[userId] || "");
                              }}
                            >
                              Ver perfil
                            </Button>
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

      {/* DIALOG DE PERFIL DO CLIENTE */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-base sm:text-lg">
                Perfil de {selectedClient?.profile?.name || "Desconhecido"}
              </DialogTitle>
              {selectedClient && (() => {
                const tier = getClientTier(selectedClient.totalSpent, selectedClient.orders.length);
                const TierIcon = tier.icon;
                return (
                  <Badge variant="outline" className={`gap-1 font-semibold text-xs ${tier.color}`}>
                    <TierIcon className="size-3" />
                    {tier.name}
                  </Badge>
                );
              })()}
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm text-muted-foreground bg-muted/30 p-3 sm:p-3.5 rounded-xl border border-border/40">
              <div className="truncate"><strong>Email:</strong> {selectedClient?.profile?.email || "-"}</div>
              <div>
                <strong>WhatsApp:</strong>{" "}
                {selectedClient?.profile?.phone ? (
                  <a
                    href={whatsappLink(selectedClient.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, selectedClient.profile.name || "Cliente"))}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:underline inline-flex items-center gap-1 font-semibold ml-1"
                  >
                    <span>{selectedClient.profile.phone}</span>
                    <MessageCircle className="size-3" />
                  </a>
                ) : (
                  "-"
                )}
              </div>
              <div><strong>Total em compras:</strong> {selectedClient ? brl(selectedClient.totalSpent) : "-"}</div>
            </div>

            {/* SEÇÃO DE ANOTAÇÕES DO CLIENTE */}
            <div className="space-y-2 rounded-xl border border-border/50 bg-background/50 p-3 sm:p-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Anotações do Cliente
              </Label>
              <Textarea
                placeholder="Ex: Colecionador focado em JDM e RLC. Paga sempre à vista no Pix..."
                value={editingNote}
                onChange={(e: any) => setEditingNote(e.target.value)}
                rows={2}
                className="text-xs sm:text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={() => selectedClient && handleSaveNote(selectedClient.userId)}
                >
                  Salvar anotação
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Reservas</h4>
              {selectedClient?.orders?.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-6 bg-muted/20 px-4 rounded-xl text-center border border-border/40">
                  Nenhum pedido ou reserva realizado ainda. Este cliente está seguindo a sua loja.
                </div>
              ) : (
                (() => {
                  const grouped = new Map<string, { order: OrderRow; quantity: number }>();
                  selectedClient?.orders?.forEach((order: OrderRow) => {
                    const key = `${order.product_id}_${order.payment_status}`;
                    if (grouped.has(key)) {
                      grouped.get(key)!.quantity += 1;
                    } else {
                      grouped.set(key, { order, quantity: 1 });
                    }
                  });

                  return Array.from(grouped.values()).map(({ order, quantity }) => (
                    <div key={`${order.product_id}_${order.payment_status}`} className="border rounded-xl p-3 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center bg-card/40 shadow-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {order.products?.image_url ? (
                          <img src={order.products.image_url} alt="Produto" className="size-12 rounded-lg object-cover border border-border/40 shrink-0" />
                        ) : (
                          <div className="size-12 bg-muted rounded-lg flex items-center justify-center text-muted-foreground shrink-0">
                            <Package className="size-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm flex items-center flex-wrap">
                            {quantity > 1 && <Badge variant="secondary" className="mr-2 text-xs py-0 h-5 px-1.5">{quantity}x</Badge>}
                            <span className="truncate">{order.products?.brand || "Desconhecido"} {order.products?.model || "Produto indisponível"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-2 items-center mt-1">
                            <span>Reserva: {new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
                            {order.tracking_code && (
                              <span className="font-mono text-primary">📦 {order.tracking_code}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto gap-1 text-sm pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
                        <div className="font-semibold">{brl(Number(order.total_price) * quantity)}</div>
                        <PaymentBadge status={order.payment_status} />
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                onChange={(e: any) => setTempWaTemplate(e.target.value)}
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
    </div>
  );
}
