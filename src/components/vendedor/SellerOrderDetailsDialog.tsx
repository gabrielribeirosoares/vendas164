import { useEffect, useRef } from "react";
import type { ReservationDetailSection } from "./ReservationNextAction";
import { useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink, Package, RefreshCw } from "lucide-react";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, getProductSignalAmount, isOrderProntaEntrega, whatsappLink } from "@/lib/format";
import { summarizeReservation } from "@/lib/reservationSummary";
import { getCustomerFromCache } from "@/lib/customerCache";
import { getReadableTextColor } from "@/lib/storeCustomizations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeliveryBadge, PaymentBadge } from "@/components/StatusBadge";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { OrderInstallmentsDialog } from "./OrderInstallmentsDialog";
import type { OrderRow } from "./OrderManager";

export type ReservationGroup = { order: OrderRow; quantity: number; ids: string[] };
const paymentLabels: Record<string, string> = {
  aguardando_sinal: "Aguardando sinal",
  sinal_pago: "Sinal pago",
  quitado: "Quitado",
  sem_sinal: "Sem sinal / pagar na chegada",
  pronta_entrega: "Pronta entrega",
  cancelado: "Cancelado",
};
const deliveryLabels: Record<string, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR");

export function SellerOrderDetailsDialog({
  group,
  initialSection,
  storeColor,
  onClose,
  onPaymentChange,
  onDeliveryChange,
}: {
  group: ReservationGroup;
  initialSection?: ReservationDetailSection;
  storeColor?: string;
  onClose: () => void;
  onPaymentChange: (group: ReservationGroup, status: string) => void;
  onDeliveryChange: (group: ReservationGroup, status: string) => void;
}) {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["seller-reservation-details", group.order.store_id, group.ids],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("orders")
        .select("*, products(*), order_installments(*)")
        .eq("store_id", group.order.store_id)
        .in("id", group.ids)
        .order("created_at");
      if (error) throw error;
      if (!rows || rows.length !== group.ids.length)
        throw new Error("Reserva indisponível. Atualize a lista.");
      return rows as unknown as OrderRow[];
    },
  });
  const paymentSectionRef = useRef<HTMLHeadingElement>(null);
  const deliverySectionRef = useRef<HTMLHeadingElement>(null);
  const didFocusSection = useRef(false);
  useEffect(() => {
    if (!data || !initialSection || didFocusSection.current) return;
    const target =
      initialSection === "payment" ? paymentSectionRef.current : deliverySectionRef.current;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
      didFocusSection.current = true;
    }
  }, [data, initialSection]);
  const rows = data || [];
  const order = rows.find((row) => row.id === group.order.id) || rows[0];
  let guest: { name?: string; phone?: string } | null = null;
  try {
    if (group.order.pix_key?.startsWith("GUEST:")) guest = JSON.parse(group.order.pix_key.slice(6));
    else if (group.order.pix_key?.startsWith('{"manual_guest":true'))
      guest = JSON.parse(group.order.pix_key);
  } catch {
    /* Older reservations can have a regular PIX key instead of guest metadata. */
  }
  const cached = getCustomerFromCache(group.order.id) || getCustomerFromCache(group.order.user_id);
  const profile = group.order.profiles;
  const name =
    guest?.name ||
    (profile?.name && !["Cliente", "Cliente cadastrado"].includes(profile.name)
      ? profile.name
      : cached?.name) ||
    profile?.email?.split("@")[0] ||
    "Cliente sem nome";
  const phone = guest?.phone || profile?.phone || cached?.phone;
  const summary = summarizeReservation(
    rows.map((row) => ({
      ...row,
      signal_amount: row.signal_amount ?? getProductSignalAmount(row.products, 1).amount,
    })),
  );
  const themeColor = storeColor || "#e11d48";
  const style = {
    "--primary": themeColor,
    "--ring": themeColor,
    "--primary-foreground": getReadableTextColor(themeColor),
  } as CSSProperties;
  const currentGroup = order ? { order, quantity: rows.length, ids: group.ids } : group;
  const mixedPayment = rows.some((row) => row.payment_status !== order?.payment_status);
  const mixedDelivery = rows.some((row) => row.delivery_status !== order?.delivery_status);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        style={style}
        className="flex max-h-[85dvh] w-[calc(100%_-_1rem)] max-w-2xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6"
      >
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle>Detalhes da reserva</DialogTitle>
          <DialogDescription>Cliente, pagamento e envio em um só lugar.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {isPending ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              Carregando reserva…
            </p>
          ) : isError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-4">
              <p className="text-sm">Não foi possível carregar todos os dados da reserva.</p>
              <Button
                disabled={isFetching}
                variant="outline"
                onClick={() => void refetch()}
                className="mt-3 gap-2"
              >
                <RefreshCw className="size-4" /> Tentar novamente
              </Button>
            </div>
          ) : order ? (
            <>
              <section className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Cliente</p>
                <h3 className="break-words text-lg font-semibold">{name}</h3>
                {!guest && profile?.email && (
                  <p className="break-all text-sm text-muted-foreground">{profile.email}</p>
                )}
                {phone && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-sm">{phone}</span>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={whatsappLink(phone, `Olá ${name}! Vamos falar sobre sua reserva?`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Conversar no WhatsApp
                      </a>
                    </Button>
                  </div>
                )}
              </section>
              <section className="flex items-center gap-3 rounded-xl border p-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {(order.variant_image_url || order.products?.image_url) ? (
                    <ProductThumbnail
                      src={order.variant_image_url || order.products?.image_url || ""}
                      alt={order.products?.model || "Miniatura"}
                      className="size-full object-contain"
                    />
                  ) : (
                    <Package className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {order.products?.brand} ·{" "}
                    {isOrderProntaEntrega(order) ? "Pronta entrega" : "Pré-venda"}
                  </p>
                  <h3 className="break-words font-semibold">
                    {order.products?.model || "Miniatura"}{order.variant_name ? ` — ${order.variant_name}` : ""}
                  </h3>
                  <p className="text-sm">
                    {rows.length} unidade(s) · {brl(Number(order.total_price))} por unidade
                  </p>
                </div>
              </section>
              <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-2">
                {[
                  ["Total da reserva", summary.total],
                  ["Recebido", summary.received],
                  ["A pagar agora", summary.dueNow],
                  ["Saldo restante", summary.balance],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`min-w-0 rounded-xl border p-3 ${label === "A pagar agora" ? "border-primary/40 bg-primary/5" : "bg-muted/20"}`}
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-lg font-bold">{brl(Number(value))}</p>
                  </div>
                ))}
              </section>
              <p className="text-xs text-muted-foreground">
                O valor a pagar agora considera o sinal pendente; o saldo restante inclui o valor
                que fica para depois.
              </p>
              <section className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    ref={paymentSectionRef}
                    tabIndex={-1}
                    className="font-semibold focus:outline-none"
                  >
                    Pagamento e parcelas
                  </h3>
                  <PaymentBadge status={order.payment_status} />
                </div>
                <label className="block text-sm">
                  Alterar situação financeira
                  <Select
                    value={mixedPayment ? undefined : order.payment_status}
                    onValueChange={(status) => {
                      onClose();
                      onPaymentChange(currentGroup, status);
                    }}
                  >
                    <SelectTrigger aria-label="Situação financeira" className="mt-1 h-11">
                      <SelectValue placeholder="Situações diferentes por unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(paymentLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <p className="text-xs text-muted-foreground">
                  Toda alteração exige confirmação e será aplicada às {rows.length} unidade(s).
                </p>
                <OrderInstallmentsDialog
                  orderId={order.id}
                  orderIds={group.ids}
                  quantity={rows.length}
                  downPayment={Number(order.down_payment)}
                  totalPrice={summary.total}
                  installmentCount={order.installment_count}
                  customerName={name}
                  productName={`${order.products?.model || "Miniatura"}${order.variant_name ? ` — ${order.variant_name}` : ""}`}
                />
                <div className="space-y-2">
                  {rows.flatMap((row) =>
                    (row.order_installments || []).map((installment) => (
                      <div
                        key={installment.id}
                        className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/30 p-2 text-sm"
                      >
                        <span>
                          {brl(Number(installment.amount))} ·{" "}
                          {installment.status === "paid" ? "Pago" : "Pendente"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {installment.status === "paid" && installment.paid_at
                            ? `Pago em ${dateLabel(installment.paid_at)}`
                            : installment.due_date
                              ? `Vence em ${new Date(`${installment.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}`
                              : "Sem vencimento"}
                        </span>
                      </div>
                    )),
                  )}
                  {!rows.some((row) => row.order_installments?.length) && (
                    <p className="text-sm text-muted-foreground">Sem parcelas cadastradas.</p>
                  )}
                </div>
              </section>
              <section className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    ref={deliverySectionRef}
                    tabIndex={-1}
                    className="font-semibold focus:outline-none"
                  >
                    Envio e rastreamento
                  </h3>
                  <DeliveryBadge status={order.delivery_status} />
                </div>
                <label className="block text-sm">
                  Alterar situação do envio
                  <Select
                    value={mixedDelivery ? undefined : order.delivery_status}
                    onValueChange={(status) => {
                      onClose();
                      onDeliveryChange(currentGroup, status);
                    }}
                  >
                    <SelectTrigger aria-label="Situação do envio" className="mt-1 h-11">
                      <SelectValue placeholder="Situações diferentes por unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(deliveryLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {Array.from(
                  new Set(rows.map((row) => row.tracking_code?.trim()).filter(Boolean)),
                ).map((code) => (
                  <Button
                    key={code}
                    asChild
                    variant="outline"
                    className="h-auto min-h-11 w-full whitespace-normal break-all"
                  >
                    <a
                      href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(code!)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 size-4 shrink-0" /> Rastrear {code}
                    </a>
                  </Button>
                ))}
                {!rows.some((row) => row.tracking_code?.trim()) && (
                  <p className="text-sm text-muted-foreground">
                    Rastreio ainda não informado. Cadastre o código na lista de reservas.
                  </p>
                )}
              </section>
              <section className="space-y-2 rounded-xl bg-muted/30 p-4 text-sm">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock className="size-4" /> Datas da reserva
                </h3>
                <p>Criada em {dateLabel(order.created_at)}</p>
                {order.reservation_expires_at && (
                  <p>Prazo do sinal: {dateLabel(order.reservation_expires_at)}</p>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Identificadores das {rows.length} unidade(s)
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {group.ids.map((id) => (
                      <li key={id} className="break-all font-mono text-xs">
                        {id}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            </>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={onClose} className="h-11 shrink-0">
          Voltar às reservas
        </Button>
      </DialogContent>
    </Dialog>
  );
}
