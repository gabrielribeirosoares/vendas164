import { useState } from "react";
import { getProductSignalAmount } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  CreditCard, 
  Loader2, 
  Check, 
  CalendarIcon, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Wallet, 
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrderInstallmentsDialogProps {
  orderId: string;
  totalPrice: number;
  installmentCount: number | null;
  customerName: string;
  productName: string;
  isCustomer?: boolean;
}

export function OrderInstallmentsDialog({
  orderId,
  totalPrice,
  installmentCount,
  customerName,
  productName,
  isCustomer = false
}: OrderInstallmentsDialogProps) {
  const [open, setOpen] = useState(false);
  const [customCount, setCustomCount] = useState(installmentCount || 1);
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>("");
  const [newPaymentDate, setNewPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [newPaymentStatus, setNewPaymentStatus] = useState<"paid" | "pending">("paid");
  const [activeTab, setActiveTab] = useState<string>("flexible");

  const queryClient = useQueryClient();

  const { data: orderMeta } = useQuery({
    queryKey: ["order_meta", orderId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("down_payment, payment_status, stores(default_installment_due_day), products(*)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const expectedSignal = getProductSignalAmount(orderMeta?.products, 1).amount;
  const actualSignal = Number(orderMeta?.down_payment || 0);
  const signalToDeduct = Math.max(expectedSignal, actualSignal);

  const { data: installments, isLoading } = useQuery({
    queryKey: ["order_installments", orderId, signalToDeduct],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select("*")
        .eq("order_id", orderId)
        .order("installment_number", { ascending: true });
      
      if (error) throw error;
      let list = data ?? [];

      // Se houver amortizações pagas ou o pedido for quitado, remove parcelas pendentes legadas/fantasmas
      const paidItems = list.filter((i) => i.status === "paid");
      const paidSum = actualSignal + paidItems.reduce((acc, curr) => acc + Number(curr.amount), 0);
      const isOrderFullyPaid = paidSum >= (totalPrice - 0.01) || orderMeta?.payment_status === "quitado";

      if (paidItems.length > 0 || isOrderFullyPaid) {
        const redundantPending = list.filter((i) => i.status === "pending");
        if (redundantPending.length > 0) {
          if (isOrderFullyPaid) {
            await supabase.from("order_installments").delete().in("id", redundantPending.map(p => p.id));
            list = paidItems;
          }
        }
      }

      // Se existir 1 única parcela pendente cujo valor é igual ao valor total do produto (sem o sinal deduzido),
      // ajustamos automaticamente para abater o sinal
      if (list.length === 1 && list[0].status === "pending" && signalToDeduct > 0 && Math.abs(Number(list[0].amount) - totalPrice) < 0.01) {
        const adjustedAmount = Math.max(0, totalPrice - signalToDeduct);
        await supabase.from("order_installments").update({ amount: adjustedAmount }).eq("id", list[0].id);
        list[0].amount = adjustedAmount;
      }

      return list;
    }
  });

  const currentList = installments || [];
  const totalPaidInsts = currentList
    .filter((i) => i.status === "paid")
    .reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalPaid = actualSignal + totalPaidInsts;
  const remainingBalance = Math.max(0, totalPrice - totalPaid);
  const excessAmount = Math.max(0, totalPaid - totalPrice);
  const progressPercent = totalPrice > 0 ? Math.min(100, Math.round((totalPaid / totalPrice) * 100)) : 0;
  const isFullyPaid = remainingBalance <= 0.001;

  const parsedInputVal = parseFloat(newPaymentAmount.replace(",", "."));
  const isAmountOverBalance = !isNaN(parsedInputVal) && parsedInputVal > (remainingBalance + 0.009);

  // Gerar parcelas fixas
  const generateInstallments = useMutation({
    mutationFn: async () => {
      const count = customCount;
      const orderData = orderMeta;
      const expectedSig = getProductSignalAmount(orderData?.products, 1).amount;
      const actualSig = Number(orderData?.down_payment || 0);
      const sigToDeduct = Math.max(expectedSig, actualSig);
      
      const amountToParcel = Math.max(0, totalPrice - sigToDeduct);
      const amountPerInstallment = amountToParcel / count;
      
      const defaultDay = (orderData?.stores as any)?.default_installment_due_day;
      
      // Limpa parcelas anteriores primeiro para recriar
      await supabase.from("order_installments").delete().eq("order_id", orderId);

      const now = new Date();
      const newInstallments = Array.from({ length: count }).map((_, i) => {
        const futureYear = now.getFullYear();
        const futureMonth = now.getMonth() + i + 1;
        
        let dueDate: Date;
        if (defaultDay && defaultDay >= 1 && defaultDay <= 31) {
          dueDate = new Date(futureYear, futureMonth, 1);
          const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
          dueDate.setDate(Math.min(defaultDay, lastDayOfMonth));
        } else {
          dueDate = new Date(futureYear, futureMonth, now.getDate());
          if (dueDate.getMonth() !== futureMonth % 12) {
            dueDate.setDate(0);
          }
        }
        return {
          order_id: orderId,
          installment_number: i + 1,
          amount: amountPerInstallment,
          due_date: dueDate.toISOString(),
          status: "pending"
        };
      });

      const { error } = await supabase.from("order_installments").insert(newInstallments);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parcelas fixas geradas com sucesso!");
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error("Erro ao gerar parcelas: " + err.message);
    }
  });

  // Adicionar pagamento avulso / amortização livre
  const addCustomPayment = useMutation({
    mutationFn: async () => {
      const val = parseFloat(newPaymentAmount.replace(",", "."));
      if (isNaN(val) || val <= 0) {
        throw new Error("Informe um valor válido maior que R$ 0,00");
      }

      if (remainingBalance <= 0) {
        throw new Error("Este pedido já está 100% quitado.");
      }

      if (val > (remainingBalance + 0.009)) {
        throw new Error(`O valor informado (${brl(val)}) ultrapassa o saldo restante de ${brl(remainingBalance)}.`);
      }

      const nextNumber = currentList.length + 1;
      const dueDate = newPaymentDate ? new Date(newPaymentDate + "T12:00:00").toISOString() : new Date().toISOString();

      const { error } = await supabase.from("order_installments").insert({
        order_id: orderId,
        installment_number: nextNumber,
        amount: val,
        due_date: dueDate,
        status: newPaymentStatus,
        paid_at: newPaymentStatus === "paid" ? new Date().toISOString() : null
      });

      if (error) throw error;

      // Se o novo pagamento quitar completamente o pedido, atualiza o status do pedido
      if (newPaymentStatus === "paid" && (totalPaid + val) >= (totalPrice - 0.01)) {
        await supabase.from("orders").update({ payment_status: "quitado" }).eq("id", orderId);
      }
    },
    onSuccess: () => {
      toast.success("Pagamento registrado com sucesso!");
      setNewPaymentAmount("");
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao registrar pagamento");
    }
  });

  // Alternar status da parcela
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
      toast.success("Status atualizado!");
      invalidateAll();
    }
  });

  // Excluir um lançamento individual
  const deleteInstallment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_installments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido!");
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error("Erro ao remover: " + err.message);
    }
  });

  // Limpar todos os lançamentos
  const clearAllInstallments = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_installments").delete().eq("order_id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Histórico de parcelas resetado!");
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error("Erro ao limpar parcelas: " + err.message);
    }
  });

  // Marcar pedido como Quitado
  const markOrderQuitado = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ payment_status: "quitado" }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido marcado como Quitado!");
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error("Erro ao quitar pedido: " + err.message);
    }
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["order_installments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order_meta", orderId] });
    queryClient.invalidateQueries({ queryKey: ["store-orders"] });
    queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    queryClient.invalidateQueries({ queryKey: ["all_installments"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium shrink-0 px-2 sm:px-3">
          <CreditCard className="size-3.5 text-primary shrink-0" />
          <span>{isCustomer ? "Ver Pagamentos" : "Parcelas"}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[96vw] sm:max-w-[650px] max-h-[92vh] flex flex-col overflow-hidden p-3.5 sm:p-6 gap-3 sm:gap-4">
        <DialogHeader className="shrink-0 space-y-1">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              {isCustomer ? "Meus Pagamentos" : `Gestão de Pagamentos`}
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            <span className="font-semibold text-foreground">{customerName}</span> &bull; {productName}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando informações financeiras...</span>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
            {/* Card Resumo Financeiro */}
            <Card className="border-border/60 bg-gradient-to-br from-card to-muted/30 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center sm:text-left">
                  <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                    <span className="text-[11px] text-muted-foreground block">Valor Total</span>
                    <span className="text-sm font-bold text-foreground">{brl(totalPrice)}</span>
                  </div>

                  {actualSignal > 0 ? (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">Sinal Pago</span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{brl(actualSignal)}</span>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                      <span className="text-[11px] text-muted-foreground block">Sinal</span>
                      <span className="text-xs font-medium text-muted-foreground">Sem sinal</span>
                    </div>
                  )}

                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">Total Já Pago</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{brl(totalPaid)}</span>
                  </div>

                  <div className={`p-2 rounded-lg border ${isFullyPaid ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                    <span className="text-[11px] block">{isFullyPaid ? "Status" : "Saldo Restante"}</span>
                    <span className="text-sm font-bold">{isFullyPaid ? "100% Quitado" : brl(remainingBalance)}</span>
                  </div>
                </div>

                {excessAmount > 0.01 && (
                  <div className="bg-amber-500/15 border border-amber-500/30 p-2 rounded-lg text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                    <span>⚠️ <strong>Atenção:</strong> O valor total pago ({brl(totalPaid)}) ultrapassou o total do pedido ({brl(totalPrice)}).</span>
                    <span className="font-bold">Excedente: {brl(excessAmount)}</span>
                  </div>
                )}

                {/* Barra de Progresso */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Progresso de Quitação</span>
                    <span className="font-bold text-primary">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>

                {/* Banner de Quitado */}
                {isFullyPaid && !isCustomer && orderMeta?.payment_status !== "quitado" && (
                  <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-500/30 p-2.5 rounded-lg text-xs">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
                      <Sparkles className="size-4" />
                      <span>Saldo 100% quitado! Deseja marcar o pedido como Quitado?</span>
                    </div>
                    <Button 
                      size="sm" 
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      onClick={() => markOrderQuitado.mutate()}
                      disabled={markOrderQuitado.isPending}
                    >
                      {markOrderQuitado.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                      Quitar Pedido
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Abas e Conteúdo */}
            {isCustomer ? (
              /* Visão do Cliente */
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Extrato de Amortizações & Parcelas
                </h4>
                {currentList.length === 0 ? (
                  <div className="text-center p-6 border border-dashed rounded-lg text-muted-foreground text-sm">
                    Nenhum pagamento avulso ou parcela registrada até o momento.
                  </div>
                ) : (
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 text-xs">
                          <TableHead className="w-14">#</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Data / Vencimento</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentList.map((inst, idx) => (
                          <TableRow key={inst.id} className="text-sm">
                            <TableCell className="font-medium text-xs text-muted-foreground">{inst.installment_number || idx + 1}º</TableCell>
                            <TableCell className="font-semibold text-foreground">{brl(Number(inst.amount))}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(inst.due_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="text-right">
                              {inst.status === "paid" ? (
                                <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/20 text-xs">
                                  ✓ Confirmado
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-xs">
                                  Pendente
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              /* Visão do Vendedor */
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <TabsList className="grid grid-cols-2 w-[340px]">
                    <TabsTrigger value="flexible" className="text-xs">
                      Amortização Livre
                    </TabsTrigger>
                    <TabsTrigger value="fixed" className="text-xs">
                      Parcelamento Fixo
                    </TabsTrigger>
                  </TabsList>

                  {currentList.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja limpar todos os lançamentos deste pedido?")) {
                          clearAllInstallments.mutate();
                        }
                      }}
                      disabled={clearAllInstallments.isPending}
                    >
                      <Trash2 className="size-3" />
                      Limpar Tudo
                    </Button>
                  )}
                </div>

                {/* Aba 1: Amortização Livre */}
                <TabsContent value="flexible" className="space-y-4 mt-0">
                  {/* Formulário de Lançamento de Pagamento */}
                  {isFullyPaid ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-lg flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <span>Este pedido está 100% quitado (Saldo restante: R$ 0,00). Não há mais valores a receber.</span>
                    </div>
                  ) : (
                    <div className="bg-muted/40 p-3.5 rounded-lg border border-border/60 space-y-3">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Plus className="size-3.5 text-primary" />
                        Lançar Pagamento / Amortização
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">R$</span>
                            <Input
                              placeholder="0,00"
                              value={newPaymentAmount}
                              onChange={(e) => setNewPaymentAmount(e.target.value)}
                              className={`pl-8 text-sm h-9 ${isAmountOverBalance ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            />
                          </div>
                        </div>
                        <div className="sm:col-span-3">
                          <Input
                            type="date"
                            value={newPaymentDate}
                            onChange={(e) => setNewPaymentDate(e.target.value)}
                            className="text-xs h-9"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <Select
                            value={newPaymentStatus}
                            onValueChange={(val: "paid" | "pending") => setNewPaymentStatus(val)}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paid">✓ Já Pago</SelectItem>
                              <SelectItem value="pending">⏳ A Receber</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-3 flex gap-1.5">
                          <Button
                            type="button"
                            onClick={() => addCustomPayment.mutate()}
                            disabled={addCustomPayment.isPending || !newPaymentAmount || isAmountOverBalance}
                            className="w-full h-9 text-xs font-semibold gap-1.5"
                          >
                            {addCustomPayment.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            Registrar
                          </Button>
                        </div>
                      </div>

                      {isAmountOverBalance && (
                        <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                          ⚠️ O valor ({brl(parsedInputVal)}) ultrapassa o saldo devedor restante ({brl(remainingBalance)}). O máximo permitido é {brl(remainingBalance)}.
                        </p>
                      )}

                      {remainingBalance > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-muted-foreground">Sugestões rápidas:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => setNewPaymentAmount(remainingBalance.toFixed(2))}
                          >
                            Quitar Saldo ({brl(remainingBalance)})
                          </Button>
                          {remainingBalance >= 100 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setNewPaymentAmount("100.00")}
                            >
                              R$ 100,00
                            </Button>
                          )}
                          {remainingBalance >= 200 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setNewPaymentAmount("200.00")}
                            >
                              R$ 200,00
                            </Button>
                          )}
                          {remainingBalance >= 500 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setNewPaymentAmount("500.00")}
                            >
                              R$ 500,00
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tabela de Lançamentos */}
                  {currentList.length === 0 ? (
                    <div className="text-center p-6 border border-dashed rounded-lg text-muted-foreground text-xs">
                      Nenhum pagamento avulso registrado ainda. Lance um valor acima para começar a amortizar o pedido.
                    </div>
                  ) : (
                    <div className="rounded-md border border-border/60 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentList.map((inst, idx) => (
                            <TableRow key={inst.id} className="text-sm">
                              <TableCell className="font-medium text-xs text-muted-foreground">{inst.installment_number || idx + 1}º</TableCell>
                              <TableCell className="font-bold text-foreground">{brl(Number(inst.amount))}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <CalendarIcon className="size-3 text-muted-foreground" />
                                  {format(new Date(inst.due_date), "dd/MM/yyyy")}
                                </div>
                              </TableCell>
                              <TableCell>
                                {inst.status === "paid" ? (
                                  <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/20 text-xs">
                                    Pago
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-xs">
                                    Pendente
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant={inst.status === "paid" ? "outline" : "default"}
                                    size="sm"
                                    className="h-7 text-[11px] px-2.5"
                                    onClick={() => toggleInstallmentStatus.mutate({ id: inst.id, currentStatus: inst.status })}
                                    disabled={toggleInstallmentStatus.isPending}
                                  >
                                    {inst.status === "paid" ? "Desfazer" : "Marcar Pago"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteInstallment.mutate(inst.id)}
                                    disabled={deleteInstallment.isPending}
                                    title="Excluir este lançamento"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Aba 2: Parcelamento Fixo */}
                <TabsContent value="fixed" className="space-y-4 mt-0">
                  <div className="bg-muted/40 p-4 rounded-lg border border-border/60 text-center space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Dividir Saldo em Parcelas Fixas
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Saldo a parcelar: <strong className="text-foreground">{brl(Math.max(0, totalPrice - signalToDeduct))}</strong>
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-3">
                      <span className="text-xs font-medium">Quantidade:</span>
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        value={customCount}
                        onChange={(e) => setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 text-center text-sm h-9"
                      />
                      <span className="text-xs font-semibold text-primary">
                        = {customCount}x de {brl(Math.max(0, totalPrice - signalToDeduct) / customCount)}
                      </span>
                    </div>

                    <Button
                      onClick={() => generateInstallments.mutate()}
                      disabled={generateInstallments.isPending}
                      className="gap-1.5 text-xs h-9"
                    >
                      {generateInstallments.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
                      Gerar {customCount} Parcelas Fixas
                    </Button>
                  </div>

                  {/* Tabela de parcelas fixas existentes */}
                  {currentList.length > 0 && (
                    <div className="rounded-md border border-border/60 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead className="w-14">Parcela</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentList.map((inst) => (
                            <TableRow key={inst.id} className="text-sm">
                              <TableCell className="font-medium text-xs">
                                {inst.installment_number} / {currentList.length}
                              </TableCell>
                              <TableCell className="font-semibold">{brl(Number(inst.amount))}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <CalendarIcon className="size-3 text-muted-foreground" />
                                  {format(new Date(inst.due_date), "dd/MM/yyyy")}
                                </div>
                              </TableCell>
                              <TableCell>
                                {inst.status === "paid" ? (
                                  <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/20 text-xs">
                                    Pago
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-xs">
                                    Pendente
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant={inst.status === "paid" ? "outline" : "default"}
                                  size="sm"
                                  className="h-7 text-[11px] px-2.5"
                                  onClick={() => toggleInstallmentStatus.mutate({ id: inst.id, currentStatus: inst.status })}
                                  disabled={toggleInstallmentStatus.isPending}
                                >
                                  {inst.status === "paid" ? "Desfazer" : "Marcar Pago"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

