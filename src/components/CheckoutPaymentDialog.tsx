import React, { useState, useEffect, useRef } from "react";
import {
  CreditCard,
  QrCode,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  Lock,
  AlertCircle,
  Zap,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  // Estados Cartão
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState(customerName || "");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [installments, setInstallments] = useState("1");
  const [processingCard, setProcessingCard] = useState(false);
  const [cardError, setCardError] = useState("");

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Limite configurado no carrinho / pedido
  const cartLimit = Math.max(1, Number(maxInstallments) || 1);
  // Limite imposto pelo valor mínimo por parcela do Mercado Pago (R$ 5,00 por parcela no Brasil)
  const mpLimit = Math.max(1, Math.floor(amount / 5.00));
  // Limite máximo efetivo permitido
  const effectiveMaxInstallments = Math.max(1, Math.min(cartLimit, mpLimit));

  // Resetar estados sempre que o modal abrir
  useEffect(() => {
    if (open) {
      setPaymentApproved(false);
      setPixData(null);
      setCardError("");
      setGeneratingPix(false);
      setProcessingCard(false);
      // Pré-seleciona a quantidade de parcelas marcada pelo comprador no carrinho, respeitando o limite do MP
      const defaultInst = Math.max(1, Math.min(cartLimit, effectiveMaxInstallments));
      setInstallments(String(defaultInst));
    }
  }, [open, cartLimit, effectiveMaxInstallments]);

  // Se o valor de parcelas selecionado for maior que o permitido, ajusta para o teto
  useEffect(() => {
    const current = parseInt(installments, 10) || 1;
    if (current > effectiveMaxInstallments) {
      setInstallments(String(effectiveMaxInstallments));
    }
  }, [effectiveMaxInstallments, installments]);

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
            identification: { type: "CPF", number: cpf.replace(/\D/g, "") },
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

  // Simular aprovação do PIX em modo Sandbox
  async function handleSimulatePixApproval() {
    setGeneratingPix(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/mercadopago/simulate-approval", {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderIds,
          amount,
          paymentId: pixData?.id || "simulated-pix",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível simular a baixa.");
      }

      handleSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erro ao simular aprovação do PIX");
    } finally {
      setGeneratingPix(false);
    }
  }

  // Simular aprovação do Cartão em modo Sandbox
  async function handleSimulateCardApproval() {
    setProcessingCard(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/mercadopago/simulate-approval", {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderIds,
          amount,
          paymentId: "simulated-card",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível simular a baixa.");
      }

      handleSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erro ao simular aprovação do Cartão");
    } finally {
      setProcessingCard(false);
    }
  }

  // Formatações de Cartão
  function handleCardNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, "$1 ");
    setCardNumber(formatted);
  }

  function handleExpiryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      setExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setExpiry(raw);
    }
  }

  function handleCpfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    const formatted = raw
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setCpf(formatted);
  }

  // Processamento de Cartão Transparente
  async function handlePayCard(e: React.FormEvent) {
    e.preventDefault();
    setCardError("");

    if (!paymentConfig?.publicKey) {
      setCardError("Configuração do Mercado Pago não encontrada.");
      return;
    }

    const cleanCard = cardNumber.replace(/\D/g, "");
    if (cleanCard.length < 13) {
      setCardError("Número do cartão inválido.");
      return;
    }

    const [monthStr, yearStr] = expiry.split("/");
    if (!monthStr || !yearStr || monthStr.length !== 2 || yearStr.length !== 2) {
      setCardError("Validade inválida (use MM/AA).");
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setCardError("Informe um CPF válido para emissão da cobrança.");
      return;
    }

    setProcessingCard(true);

    try {
      // 1. Tokenizar cartão direto no Mercado Pago (PCI compliance)
      const tokenRes = await fetch(
        `https://api.mercadopago.com/v1/card_tokens?public_key=${paymentConfig.publicKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card_number: cleanCard,
            cardholder: {
              name: cardHolder.trim(),
              identification: {
                type: "CPF",
                number: cleanCpf,
              },
            },
            expiration_month: parseInt(monthStr, 10),
            expiration_year: parseInt(`20${yearStr}`, 10),
            security_code: cvv.trim(),
          }),
        }
      );

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.id) {
        console.error("Erro tokenização MP:", tokenData);
        throw new Error(
          tokenData.message || tokenData.cause?.[0]?.description || "Dados do cartão incorretos."
        );
      }

      // 2. Chamar nosso backend para processar o pagamento
      const { data: sessionData } = await supabase.auth.getSession();
      const userToken = sessionData?.session?.access_token;
      const payHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (userToken) {
        payHeaders["Authorization"] = `Bearer ${userToken}`;
      }

      // Detectar bandeira a partir do número do cartão
      const detectedBrand = cleanCard.startsWith("4")
        ? "visa"
        : /^5[1-5]/.test(cleanCard) || /^2[2-7]/.test(cleanCard)
        ? "master"
        : /^(34|37)/.test(cleanCard)
        ? "amex"
        : /^(4011|4389|4514|5067|6504)/.test(cleanCard)
        ? "elo"
        : "visa";

      const payRes = await fetch("/api/mercadopago/create-payment", {
        method: "POST",
        headers: payHeaders,
        body: JSON.stringify({
          storeId,
          orderIds,
          amount,
          paymentMethodId: tokenData.payment_method?.id || detectedBrand,
          token: tokenData.id,
          installments: Math.max(1, Math.min(parseInt(installments, 10) || 1, effectiveMaxInstallments)),
          payer: {
            email: customerEmail || "cliente@vendas164.com.br",
            firstName: cardHolder.split(" ")[0] || "Cliente",
            lastName: cardHolder.split(" ").slice(1).join(" ") || "Vendas164",
            identification: { type: "CPF", number: cleanCpf },
          },
        }),
      });

      const payData = await payRes.json();
      if (!payRes.ok) {
        throw new Error(payData.error || "Não foi possível concluir o pagamento.");
      }

      if (payData.status === "approved") {
        handleSuccess();
      } else if (payData.status === "in_process") {
        toast.info("Pagamento em análise pelo Mercado Pago.");
        onOpenChange(false);
      } else {
        throw new Error(
          payData.statusDetail === "cc_rejected_insufficient_amount"
            ? "Saldo insuficiente no cartão."
            : payData.statusDetail === "cc_rejected_bad_filled_security_code"
            ? "Código de segurança (CVV) inválido."
            : "Pagamento não autorizado pelo emissor do cartão."
        );
      }
    } catch (err: any) {
      setCardError(err.message || "Erro ao processar cartão de crédito.");
      toast.error(err.message || "Erro no pagamento");
    } finally {
      setProcessingCard(false);
    }
  }

  // Lista de parcelas respeitando estritamente o limite do carrinho e o mínimo de R$ 5,00/parcela do Mercado Pago
  const installmentOptions = Array.from({ length: effectiveMaxInstallments }, (_, i) => {
    const num = i + 1;
    const value = amount / num;
    return {
      num,
      label: `${num}x de ${brl(value)} ${num === 1 ? "(à vista)" : "sem juros"}`,
    };
  });

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

                      {paymentConfig?.isSandbox && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={generatingPix}
                          onClick={handleSimulatePixApproval}
                          className="w-full border-dashed border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold gap-1.5 h-8 mt-1"
                        >
                          <Zap className="size-3.5" /> Simular Pagamento do PIX (Modo Teste)
                        </Button>
                      )}
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

                {/* ABA CARTÃO DE CRÉDITO */}
                <TabsContent value="card" className="space-y-4 mt-0">
                  <form onSubmit={handlePayCard} className="space-y-3">
                    {cardError && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{cardError}</span>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Número do Cartão</Label>
                      <div className="relative">
                        <Input
                          placeholder="0000 0000 0000 0000"
                          value={cardNumber}
                          onChange={handleCardNumberChange}
                          required
                          className="pr-10 text-sm font-mono"
                        />
                        <CreditCard className="size-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Nome impresso no Cartão</Label>
                      <Input
                        placeholder="NOME COMO NO CARTÃO"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                        required
                        className="text-sm uppercase"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Validade</Label>
                        <Input
                          placeholder="MM/AA"
                          value={expiry}
                          onChange={handleExpiryChange}
                          required
                          className="text-sm font-mono text-center"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CVV</Label>
                        <Input
                          placeholder="123"
                          value={cvv}
                          maxLength={4}
                          onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
                          required
                          className="text-sm font-mono text-center"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">CPF do Titular</Label>
                      <Input
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={handleCpfChange}
                        required
                        className="text-sm font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Parcelamento</Label>
                      <Select value={installments} onValueChange={setInstallments}>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Selecione as parcelas" />
                        </SelectTrigger>
                        <SelectContent>
                          {installmentOptions.map((opt) => (
                            <SelectItem key={opt.num} value={opt.num.toString()} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="submit"
                      disabled={processingCard}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mt-2 h-10 gap-2"
                    >
                      {processingCard ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Processando Pagamento...
                        </>
                      ) : (
                        <>
                          <Lock className="size-4" /> Pagar {brl(amount)}
                        </>
                      )}
                    </Button>

                    {paymentConfig?.isSandbox && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={processingCard}
                        onClick={handleSimulateCardApproval}
                        className="w-full border-dashed border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold gap-1.5 h-8 mt-1"
                      >
                        <Zap className="size-3.5" /> Simular Pagamento do Cartão (Modo Teste)
                      </Button>
                    )}

                    <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
                      <Lock className="size-3 text-primary" /> Pagamento 100% criptografado e seguro
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
