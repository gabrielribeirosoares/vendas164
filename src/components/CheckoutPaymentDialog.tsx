import { useState, useEffect, useRef } from "react";
import {
  CreditCard,
  QrCode,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  Lock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface CheckoutPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName?: string;
  orderIds: string[];
  amount: number;
  maxInstallments?: number;
  customerEmail?: string;
  customerName?: string;
  onPaymentSuccess?: () => void;
}

export function CheckoutPaymentDialog({
  open,
  onOpenChange,
  storeId,
  storeName = "Loja",
  orderIds,
  amount,
  maxInstallments = 1,
  customerEmail = "",
  customerName = "",
  onPaymentSuccess,
}: CheckoutPaymentDialogProps) {
  const [activeTab, setActiveTab] = useState<"pix" | "card">("pix");
  const [paymentConfig, setPaymentConfig] = useState<{
    isConfigured: boolean;
    publicKey: string | null;
    isSandbox: boolean;
  } | null>(null);

  // Estados PIX
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    id: number | string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [paymentApproved, setPaymentApproved] = useState(false);

  // Estados Cartão (Checkout Pro Oficial do Mercado Pago)
  const [redirectingToMp, setRedirectingToMp] = useState(false);
  const [cardError, setCardError] = useState("");

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Resetar estados sempre que o modal abrir
  useEffect(() => {
    if (open) {
      setPaymentApproved(false);
      setPixData(null);
      setCardError("");
      setGeneratingPix(false);
      setRedirectingToMp(false);
    }
  }, [open]);

  // 1. Carregar configuração de pagamento da loja
  useEffect(() => {
    if (!open || !storeId) return;

    fetch(`/api/mercadopago/public-config?storeId=${storeId}`)
      .then((res) => res.json())
      .then((data) => {
        setPaymentConfig(data);
      })
      .catch((err) => {
        console.error("Erro ao carregar config MP:", err);
      });
  }, [open, storeId]);

  // 2. Gerar PIX automaticamente ao abrir a aba PIX se configurado
  useEffect(() => {
    if (open && activeTab === "pix" && paymentConfig?.isConfigured && !pixData && !generatingPix && !paymentApproved) {
      handleGeneratePix();
    }
  }, [open, activeTab, paymentConfig, pixData, paymentApproved]);

  // 3. Monitoramento em tempo real do pagamento (apenas se houver nova mudança de status)
  useEffect(() => {
    if (!open || !orderIds || orderIds.length === 0 || paymentApproved) return;

    let isMounted = true;
    const initialStatuses = new Map<string, string>();
    let initialFetched = false;

    // Carregar status inicial dos pedidos no momento da abertura do modal
    supabase
      .from("orders")
      .select("id, payment_status")
      .in("id", orderIds)
      .then(({ data }) => {
        if (!isMounted) return;
        for (const o of data || []) {
          initialStatuses.set(o.id, o.payment_status);
        }
        initialFetched = true;
      });

    const isOrderSuccessfullyUpdated = (orderId: string, currentStatus: string) => {
      if (!initialFetched) return false;
      const initial = initialStatuses.get(orderId);
      // Se não mudou em relação ao status que já estava no banco, não é novo pagamento
      if (!initial || currentStatus === initial) return false;

      if (initial === "aguardando_sinal") {
        return currentStatus === "sinal_pago" || currentStatus === "quitado";
      } else if (initial === "sinal_pago") {
        return currentStatus === "quitado";
      } else {
        return currentStatus === "quitado" || currentStatus === "sinal_pago";
      }
    };

    // Supabase Realtime subscription
    const channel = supabase
      .channel(`orders-payment-${orderIds.join("-")}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const updated = payload.new as any;
          if (
            orderIds.includes(updated.id) &&
            isOrderSuccessfullyUpdated(updated.id, updated.payment_status)
          ) {
            handleSuccess();
          }
        }
      )
      .subscribe();

    // Polling de fallback a cada 3 segundos
    pollIntervalRef.current = setInterval(async () => {
      try {
        if (!initialFetched) return;
        const { data } = await supabase
          .from("orders")
          .select("id, payment_status")
          .in("id", orderIds);

        if (data && data.length > 0) {
          const allUpdated = data.every((o) =>
            isOrderSuccessfullyUpdated(o.id, o.payment_status)
          );
          if (allUpdated) {
            handleSuccess();
          }
        }
      } catch (err) {
        // Silencioso
      }
    }, 3000);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [open, orderIds, paymentApproved]);

  function handleSuccess() {
    setPaymentApproved(true);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    toast.success("Pagamento confirmado com sucesso!");
    if (onPaymentSuccess) onPaymentSuccess();
  }

  // Geração de PIX Dinâmico
  async function handleGeneratePix() {
    if (generatingPix) return;
    setGeneratingPix(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/mercadopago/create-payment", {
        method: "POST",
        headers,
        body: JSON.stringify({
          storeId,
          orderIds,
          amount,
          paymentMethodId: "pix",
          payer: {
            email: customerEmail || "cliente@vendas164.com.br",
            firstName: customerName || "Cliente",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível gerar a cobrança PIX.");
      }

      if (data.pix) {
        setPixData({
          qrCode: data.pix.qrCode,
          qrCodeBase64: data.pix.qrCodeBase64,
          id: data.id,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar PIX");
    } finally {
      setGeneratingPix(false);
    }
  }

  // Copiar código PIX
  const copyPixCode = async () => {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopiedPix(true);
      toast.success("Código PIX Copia e Cola copiado!");
      setTimeout(() => setCopiedPix(false), 3000);
    } catch {
      toast.error("Erro ao copiar código PIX.");
    }
  };

  // Redirecionar para o Checkout Pro Oficial do Mercado Pago
  async function handleRedirectToMercadoPago() {
    setRedirectingToMp(true);
    setCardError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userToken = sessionData?.session?.access_token;
      const payHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (userToken) {
        payHeaders["Authorization"] = `Bearer ${userToken}`;
      }

      const res = await fetch("/api/mercadopago/create-payment", {
        method: "POST",
        headers: payHeaders,
        body: JSON.stringify({
          storeId,
          storeName,
          orderIds,
          amount,
          paymentMethodId: "checkout_pro",
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
          payer: {
            name: customerName,
            email: customerEmail,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao conectar com o Mercado Pago.");
      }

      const checkoutUrl = (paymentConfig?.isSandbox && data.sandboxInitPoint)
        ? data.sandboxInitPoint
        : (data.initPoint || data.sandboxInitPoint);

      if (!checkoutUrl) {
        throw new Error("Link do checkout não retornado pelo Mercado Pago.");
      }

      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error("Erro ao redirecionar para Mercado Pago:", err);
      setCardError(err.message || "Erro ao abrir Mercado Pago.");
      toast.error(err.message || "Erro ao abrir Mercado Pago.");
      setRedirectingToMp(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/80 shadow-2xl bg-card">
        {paymentApproved ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="size-16 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center animate-bounce">
              <Check className="size-8 stroke-[3]" />
            </div>
            <DialogTitle className="text-2xl font-bold text-foreground">
              Pagamento Confirmado! 🎉
            </DialogTitle>
            <p className="text-muted-foreground text-sm max-w-xs">
              Seu pedido na loja <strong>{storeName}</strong> foi aprovado e a sua miniatura já está garantida.
            </p>
            <div className="bg-muted/50 p-4 rounded-xl w-full text-xs text-muted-foreground space-y-1 border">
              <div className="flex justify-between">
                <span>Valor pago:</span>
                <strong className="text-foreground font-semibold">{brl(amount)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Destino:</span>
                <span className="text-foreground font-medium">{storeName}</span>
              </div>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold mt-2"
              onClick={() => onOpenChange(false)}
            >
              Concluir
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="p-6 pb-4 pr-12 sm:pr-14 bg-muted/30 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold">Finalizar Pagamento</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Pagamento direto para <strong className="text-foreground">{storeName}</strong>
                    </DialogDescription>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground block">Total a pagar</span>
                  <span className="text-lg font-extrabold text-foreground">{brl(amount)}</span>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6 pt-4">
              {paymentConfig && !paymentConfig.isConfigured ? (
                <div className="py-8 text-center space-y-4">
                  <div className="size-14 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="size-7" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">Pagamento online indisponível</p>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      A loja <strong>{storeName}</strong> ainda não configurou o recebimento automático via Mercado Pago.
                      Entre em contato com o vendedor para combinar outra forma de pagamento.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="text-xs"
                    onClick={() => onOpenChange(false)}
                  >
                    Fechar
                  </Button>
                </div>
              ) : (
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as any)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="pix" className="gap-2 text-xs font-semibold">
                    <QrCode className="size-4 text-emerald-600" /> PIX Instantâneo
                  </TabsTrigger>
                  <TabsTrigger value="card" className="gap-2 text-xs font-semibold">
                    <CreditCard className="size-4 text-sky-600" /> Cartão de Crédito
                  </TabsTrigger>
                </TabsList>

                {/* ABA PIX */}
                <TabsContent value="pix" className="space-y-4 mt-0">
                  {generatingPix ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="size-8 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground font-medium">
                        Gerando QR Code PIX exclusivo...
                      </p>
                    </div>
                  ) : pixData ? (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl border shadow-inner">
                        {pixData.qrCodeBase64 ? (
                          <img
                            src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                            alt="QR Code PIX"
                            className="size-48 object-contain"
                          />
                        ) : (
                          <div className="size-48 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                            QR Code Indisponível
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1 font-medium">
                          <Lock className="size-3 text-emerald-600" /> Escaneie com o app do seu banco
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Código Copia e Cola:</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={pixData.qrCode}
                            className="text-xs font-mono bg-muted/40 truncate"
                          />
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1.5"
                            onClick={copyPixCode}
                          >
                            {copiedPix ? <Check className="size-4" /> : <Copy className="size-4" />}
                            {copiedPix ? "Copiado!" : "Copiar"}
                          </Button>
                        </div>
                      </div>

                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg flex items-center gap-2.5">
                        <div className="size-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <p className="text-xs text-emerald-800 dark:text-emerald-300">
                          Aguardando confirmação bancária. Assim que transferir, o pedido aprova na hora!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Pague com PIX dinâmico com baixa automática e aprovação imediata.
                      </p>
                      <Button
                        onClick={handleGeneratePix}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                      >
                        Gerar QR Code PIX
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* ABA CARTÃO DE CRÉDITO (CHECKOUT PRO OFICIAL MERCADO PAGO) */}
                <TabsContent value="card" className="space-y-4 mt-0">
                  {cardError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{cardError}</span>
                    </div>
                  )}

                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-[#009ee3]/15 flex items-center justify-center text-[#009ee3]">
                          <CreditCard className="size-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground block">Mercado Pago</span>
                          <span className="text-[10px] text-muted-foreground">Checkout Oficial e Seguro</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        🛡️ 100% Protegido
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Você será redirecionado para a tela oficial do <strong>Mercado Pago</strong> para pagar com cartão de crédito com as condições, parcelas e taxas configuradas pela loja <strong className="text-foreground">{storeName}</strong>.
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-emerald-500 font-bold">✓</span> {maxInstallments > 1 ? `Até ${maxInstallments}x no cartão` : "Parcelamento da loja"}
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-emerald-500 font-bold">✓</span> Cartões salvos no app
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-emerald-500 font-bold">✓</span> Todas as bandeiras
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-emerald-500 font-bold">✓</span> Confirmação imediata
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-background/80 p-3 rounded-lg border border-border/60">
                      <span className="text-xs text-muted-foreground">Total a pagar:</span>
                      <span className="text-base font-bold text-foreground">{brl(amount)}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={redirectingToMp}
                    onClick={handleRedirectToMercadoPago}
                    className="w-full bg-[#009ee3] hover:bg-[#0081ba] text-white font-bold h-11 gap-2 text-sm shadow-md"
                  >
                    {redirectingToMp ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Conectando ao Mercado Pago...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="size-4" /> Pagar com Cartão no Mercado Pago
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
                    <Lock className="size-3 text-primary" /> Transação processada em ambiente seguro do Mercado Pago
                  </p>
                </TabsContent>
              </Tabs>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
