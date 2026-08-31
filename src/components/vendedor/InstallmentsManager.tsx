import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import { CreditCard, Loader2, CalendarIcon, MessageCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, whatsappLink } from "@/lib/format";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function InstallmentsManager({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "late">("pending");
  const [clientSearch, setClientSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["all_installments", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      // First, get all orders for this store
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, total_price, user_id, products(model, brand)")
        .eq("store_id", storeId);
        
      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];
      
      const orderIds = orders.map(o => o.id);
      const userIds = [...new Set(orders.map((o) => o.user_id))];

      // Fetch profiles manually
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, name, phone").in("id", userIds)
        : { data: [] };
      const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Then get all installments for those orders
      const { data: installments, error: instError } = await supabase
        .from("order_installments")
        .select("*")
        .in("order_id", orderIds)
        .order("due_date", { ascending: true });
        
      if (instError) throw instError;
      
      // Merge data
      return installments.map(inst => {
        const order = orders.find(o => o.id === inst.order_id);
        const profile = order ? profilesById.get(order.user_id) : null;
        let status = inst.status;
        
        // Calculate if late
        if (status === "pending" && isBefore(new Date(inst.due_date), startOfDay(new Date()))) {
          status = "late";
        }
        
        return {
          ...inst,
          computed_status: status,
          customer_name: profile?.name || "Cliente sem nome",
          customer_phone: profile?.phone,
          product_name: `${(order?.products as any)?.brand || ""} ${(order?.products as any)?.model || ""}`.trim()
        };
      });
    }
  });

  const toggleInstallmentStatus = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string, currentStatus: string }) => {
      const newStatus = currentStatus === "paid" ? "pending" : "paid";
      const paidAt = newStatus === "paid" ? new Date().toISOString() : null;
      
      const { error } = await supabase
        .from("order_installments")
        .update({ status: newStatus, paid_at: paidAt })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status da parcela atualizado!");
      queryClient.invalidateQueries({ queryKey: ["all_installments", storeId] });
    }
  });

  const filteredData = data?.filter(inst => {
    const matchesFilter = filter === "all" || inst.computed_status === filter;
    const matchesSearch = !clientSearch || inst.customer_name.toLowerCase().includes(clientSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  }) || [];

  const pages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const paginatedData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Central de Cobranças</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie e acompanhe os pagamentos das compras parceladas.
          </p>
        </div>
        
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setPage(0);
              }}
              className="w-full sm:w-[220px] pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v: any) => {
            setFilter(v);
            setPage(0);
          }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="late">Atrasadas</SelectItem>
              <SelectItem value="paid">Pagas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <CreditCard className="size-12 mx-auto mb-4 opacity-20" />
              Nenhuma parcela encontrada para este filtro.
            </div>
          ) : (
            <>
              {/* Tabela para Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Miniatura</TableHead>
                    <TableHead>Nº Parcela</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((inst) => {
                    const isOverdue = inst.computed_status === "late";
                    
                    return (
                      <TableRow key={inst.id}>
                        <TableCell>
                          <p className="font-medium">{inst.customer_name}</p>
                          {inst.customer_phone && (
                            <p className="text-xs text-muted-foreground">{inst.customer_phone}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={inst.product_name}>
                          {inst.product_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{inst.installment_number}ª Parcela</Badge>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm ${isOverdue ? "text-destructive font-semibold" : ""}`}>
                            <CalendarIcon className="size-3.5" />
                            {format(new Date(inst.due_date), "dd/MM/yyyy")}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{brl(Number(inst.amount))}</TableCell>
                        <TableCell>
                          {inst.computed_status === "paid" ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600">Pago</Badge>
                          ) : inst.computed_status === "late" ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <AlertTriangle className="size-3" /> Atrasado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-amber-500 bg-amber-500/10 hover:bg-amber-500/20">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inst.customer_phone && inst.computed_status !== "paid" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                                title="Enviar cobrança via WhatsApp"
                                onClick={() => {
                                  const msg = `Olá ${inst.customer_name}!\n\nPassando para lembrar do vencimento da sua *${inst.installment_number}ª parcela* no valor de *${brl(Number(inst.amount))}* referente à miniatura *${inst.product_name}*.\n\nVencimento: ${format(new Date(inst.due_date), "dd/MM/yyyy")}.\n\nQualquer dúvida estou à disposição!`;
                                  window.open(whatsappLink(inst.customer_phone, msg), "_blank");
                                }}
                              >
                                <MessageCircle className="size-4" />
                              </Button>
                            )}
                            <Button
                              variant={inst.computed_status === "paid" ? "outline" : "default"}
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => toggleInstallmentStatus.mutate({ id: inst.id, currentStatus: inst.status })}
                              disabled={toggleInstallmentStatus.isPending}
                            >
                              {inst.status === "paid" ? "Desfazer" : "Marcar Pago"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>

              {/* Cartões para Mobile */}
              <div className="md:hidden flex flex-col divide-y divide-border/50">
                {paginatedData.map((inst) => {
                  const isOverdue = inst.computed_status === "late";
                  return (
                    <div key={inst.id} className="p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{inst.customer_name}</p>
                          {inst.customer_phone && (
                            <p className="text-xs text-muted-foreground">{inst.customer_phone}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {inst.installment_number}ª Parcela
                        </Badge>
                      </div>
                      
                      <p className="text-xs font-medium text-foreground/80 line-clamp-1">{inst.product_name}</p>
                      
                      <div className="flex justify-between items-center text-sm bg-muted/20 p-2 rounded-md border border-border/30">
                        <div className={`flex items-center gap-1.5 ${isOverdue ? "text-destructive font-semibold" : ""}`}>
                          <CalendarIcon className="size-3.5" />
                          {format(new Date(inst.due_date), "dd/MM/yyyy")}
                        </div>
                        <span className="font-bold text-primary">{brl(Number(inst.amount))}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2">
                        <div>
                          {inst.computed_status === "paid" ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600">Pago</Badge>
                          ) : inst.computed_status === "late" ? (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="size-3" /> Atrasado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-amber-500 bg-amber-500/10 hover:bg-amber-500/20">Pendente</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {inst.customer_phone && inst.computed_status !== "paid" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                              onClick={() => {
                                const msg = `Olá ${inst.customer_name}!\n\nPassando para lembrar do vencimento da sua *${inst.installment_number}ª parcela* no valor de *${brl(Number(inst.amount))}* referente à miniatura *${inst.product_name}*.\n\nVencimento: ${format(new Date(inst.due_date), "dd/MM/yyyy")}.\n\nQualquer dúvida estou à disposição!`;
                                window.open(whatsappLink(inst.customer_phone, msg), "_blank");
                              }}
                            >
                              <MessageCircle className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant={inst.computed_status === "paid" ? "outline" : "default"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => toggleInstallmentStatus.mutate({ id: inst.id, currentStatus: inst.status })}
                            disabled={toggleInstallmentStatus.isPending}
                          >
                            {inst.status === "paid" ? "Desfazer" : "Pagar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Mostrando {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, filteredData.length)} de {filteredData.length} parcelas
                  </span>
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Anterior
                    </Button>
                    <div className="text-xs sm:text-sm font-medium px-2">
                      {page + 1} / {pages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                      disabled={page >= pages - 1}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
