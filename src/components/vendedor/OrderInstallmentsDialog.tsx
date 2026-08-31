import { useState } from "react";
import { getProductSignalAmount } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CreditCard, Loader2, Check, Clock, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  const queryClient = useQueryClient();

  const { data: installments, isLoading } = useQuery({
    queryKey: ["order_installments", orderId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select("*")
        .eq("order_id", orderId)
        .order("installment_number", { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: orderMeta } = useQuery({
    queryKey: ["order_meta", orderId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("down_payment, products(*)").eq("id", orderId).maybeSingle();
      return data;
    }
  });

  const expectedSignal = getProductSignalAmount(orderMeta?.products, 1).amount;
  const actualSignal = Number(orderMeta?.down_payment || 0);
  const signalToDeduct = Math.max(expectedSignal, actualSignal);
  const amountToParcel = Math.max(0, totalPrice - signalToDeduct);

  const generateInstallments = useMutation({
    mutationFn: async () => {
      const count = customCount;
      const { data: orderData } = await supabase.from("orders").select("down_payment, stores(default_installment_due_day), products(*)").eq("id", orderId).maybeSingle();
      const expectedSignal = getProductSignalAmount(orderData?.products, 1).amount;
      const actualSignal = Number(orderData?.down_payment || 0);
      const signalToDeduct = Math.max(expectedSignal, actualSignal);
      
      const amountToParcel = Math.max(0, totalPrice - signalToDeduct);
      const amountPerInstallment = amountToParcel / count;
      
      const defaultDay = (orderData?.stores as any)?.default_installment_due_day;
      
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
      toast.success("Parcelas geradas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["order_installments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["store-orders"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao gerar parcelas: " + err.message);
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
      queryClient.invalidateQueries({ queryKey: ["order_installments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["store-orders"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <CreditCard className="size-4" />
          Ver Parcelas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Parcelas: {customerName}</DialogTitle>
          <p className="text-sm text-muted-foreground">{productName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
            {!installments || installments.length === 0 ? (
              <div className="text-center p-6 border border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground mb-4">
                  As parcelas ainda não foram geradas para este pedido.
                </p>
                <div className="flex flex-col items-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Dividir em:</span>
                    <Input 
                      type="number" 
                      min="1" 
                      max="12" 
                      value={customCount}
                      onChange={(e) => setCustomCount(Number(e.target.value) || 1)}
                      className="w-20 text-center"
                    />
                    <span className="text-sm font-medium">x de {brl(amountToParcel / customCount)}</span>
                  </div>
                  <Button 
                    onClick={() => generateInstallments.mutate()}
                    disabled={generateInstallments.isPending}
                    className={isCustomer ? "hidden" : ""}
                  >
                    {generateInstallments.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Gerar Parcelas
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Nº</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      {!isCustomer && <TableHead className="text-right">Ação</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installments.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell className="font-medium">{inst.installment_number} / {installments.length}</TableCell>
                        <TableCell>{brl(Number(inst.amount))}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <CalendarIcon className="size-3.5 text-muted-foreground" />
                            {format(new Date(inst.due_date), "dd/MM/yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {inst.status === "paid" ? (
                            <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">Pago</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-amber-500 bg-amber-500/10 hover:bg-amber-500/20">Pendente</Badge>
                          )}
                        </TableCell>
                        {!isCustomer && (
                          <TableCell className="text-right">
                            <Button
                              variant={inst.status === "paid" ? "outline" : "default"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => toggleInstallmentStatus.mutate({ id: inst.id, currentStatus: inst.status })}
                              disabled={toggleInstallmentStatus.isPending}
                            >
                              {inst.status === "paid" ? "Desfazer" : "Marcar Pago"}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {installments && installments.length > 0 && (
              <div className="flex justify-between bg-muted/50 p-3 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">Total Pago: </span>
                  <span className="font-semibold text-emerald-500">
                    {brl(installments.filter(i => i.status === "paid").reduce((acc, curr) => acc + Number(curr.amount), 0))}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pendente: </span>
                  <span className="font-semibold text-amber-500">
                    {brl(installments.filter(i => i.status === "pending").reduce((acc, curr) => acc + Number(curr.amount), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
