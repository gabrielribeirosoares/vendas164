import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, Lock, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PaymentSettingsTabProps {
  storeId: string;
  storeName?: string;
  legacyPixKey?: string;
  onUpdateLegacyPix?: (newKey: string) => void;
}

type ConnectionStatus = {
  configured: boolean;
  connected: boolean;
  connectionType: "manual" | "oauth" | null;
  isLegacy: boolean;
};

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Entre novamente na sua conta para gerenciar os pagamentos.");
  return token;
}

export function PaymentSettingsTab({ storeId, storeName = "sua loja" }: PaymentSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  async function loadStatus(showToast = false) {
    setLoading(true);
    try {
      const token = await sessionToken();
      const response = await fetch(`/api/mercadopago/oauth/status?storeId=${encodeURIComponent(storeId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a conexão.");
      setStatus(result);
      if (showToast) toast.success("Status da conexão atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar a conexão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadStatus(); }, [storeId]);

  async function connect() {
    setWorking(true);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/mercadopago/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Não foi possível iniciar a conexão.");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conexão.");
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Deseja desconectar o Mercado Pago da loja ${storeName}? Os pagamentos automáticos ficarão indisponíveis.`)) return;
    setWorking(true);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/mercadopago/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível desconectar a conta.");
      toast.success("Conta do Mercado Pago desconectada.");
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar a conta.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <CreditCard className="size-6 text-primary" /> Pagamentos e Checkout
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Receba por PIX e cartão diretamente na sua conta, sem copiar chaves ou tokens.
        </p>
      </div>

      {loading ? (
        <Card className="border-border/40 p-8 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-2 text-xs text-muted-foreground">Verificando conexão com o Mercado Pago...</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/50 bg-card">
          <CardHeader className="border-b bg-muted/20 p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className={`flex size-11 items-center justify-center rounded-xl ${status?.connected ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                  {status?.connected ? <CheckCircle2 className="size-6" /> : <CreditCard className="size-6" />}
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    {status?.connected ? "Mercado Pago conectado" : "Conecte sua conta do Mercado Pago"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {status?.connected
                      ? `Os pagamentos de ${storeName} são confirmados automaticamente.`
                      : "Você será direcionado ao Mercado Pago para autorizar o Vendas164."}
                  </CardDescription>
                </div>
              </div>
              {status?.connected && (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-600">
                  {status.isLegacy ? "Conexão atual" : "OAuth seguro"}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-foreground">Conexão oficial e protegida</p>
                <p className="leading-relaxed text-muted-foreground">
                  O login e a autorização acontecem no Mercado Pago. O Vendas164 não solicita que você copie Access Token, Public Key ou outras credenciais.
                </p>
              </div>
            </div>

            {!status?.configured && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-foreground">Integração aguardando configuração da plataforma</p>
                  <p className="mt-1 text-muted-foreground">O administrador precisa cadastrar a aplicação Vendas164 no Mercado Pago antes de liberar novas conexões.</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button onClick={connect} disabled={working || !status?.configured} className="gap-2 text-xs font-semibold">
                {working ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                {status?.connected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
              </Button>
              {status?.connected && (
                <Button variant="outline" onClick={disconnect} disabled={working} className="gap-2 text-xs text-destructive hover:bg-destructive/10">
                  <Unplug className="size-4" /> Desconectar
                </Button>
              )}
              <Button variant="ghost" onClick={() => void loadStatus(true)} disabled={working} className="gap-2 text-xs text-muted-foreground">
                <RefreshCw className="size-4" /> Atualizar status
              </Button>
            </div>

            {status?.connected && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3.5 text-emerald-600" /> Tokens protegidos no servidor e renovados automaticamente.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
