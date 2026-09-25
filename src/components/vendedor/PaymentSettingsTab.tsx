import React, { useState, useEffect } from "react";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PaymentSettingsTabProps {
  storeId: string;
  storeName?: string;
  legacyPixKey?: string;
  onUpdateLegacyPix?: (newKey: string) => void;
}

export function PaymentSettingsTab({
  storeId,
}: PaymentSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    isConfigured: boolean;
    isActive: boolean;
    isSandbox: boolean;
    publicKey: string | null;
    hasToken: boolean;
    mpUserId?: string | null;
  } | null>(null);

  // Formulário manual de credenciais
  const [publicKeyInput, setPublicKeyInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [isSandboxInput, setIsSandboxInput] = useState(true);

  // Carregar status do gateway
  async function loadStatus() {
    setLoading(true);
    try {
      // Chamar RPC segura no Supabase
      const { data, error } = await (supabase.rpc as any)("get_store_payment_status", {
        p_store_id: storeId,
      });

      if (!error && data) {
        setStatus({
          isConfigured: data.is_configured ?? false,
          isActive: data.is_active ?? false,
          isSandbox: data.is_sandbox ?? true,
          publicKey: data.public_key,
          hasToken: data.has_token ?? false,
          mpUserId: data.mp_user_id,
        });
        if (data.public_key) setPublicKeyInput(data.public_key);
        setIsSandboxInput(data.is_sandbox ?? true);
      } else {
        // Fallback: se RPC não responder ainda, buscar config pública
        const res = await fetch(`/api/mercadopago/public-config?storeId=${storeId}`);
        const conf = await res.json();
        if (conf.isConfigured) {
          setStatus({
            isConfigured: true,
            isActive: true,
            isSandbox: conf.isSandbox ?? true,
            publicKey: conf.publicKey,
            hasToken: true,
          });
          if (conf.publicKey) setPublicKeyInput(conf.publicKey);
        } else {
          setStatus({
            isConfigured: false,
            isActive: false,
            isSandbox: true,
            publicKey: null,
            hasToken: false,
          });
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar status do pagamento:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [storeId]);

  // Salvar credenciais
  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKeyInput.trim() || (!status?.hasToken && !accessTokenInput.trim())) {
      toast.error("Por favor, preencha a Public Key e o Access Token.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("save_store_payment_credentials", {
        p_store_id: storeId,
        p_public_key: publicKeyInput.trim(),
        p_access_token: accessTokenInput.trim() || "",
        p_is_sandbox: isSandboxInput,
        p_is_active: true,
      });

      if (error) throw error;

      toast.success("Credenciais do Mercado Pago salvas com sucesso!");
      setAccessTokenInput("");
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar credenciais.");
    } finally {
      setSaving(false);
    }
  }

  // Desconectar / Desativar
  async function handleDisconnect() {
    if (!confirm("Deseja realmente desativar os pagamentos automáticos desta loja?")) return;
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("save_store_payment_credentials", {
        p_store_id: storeId,
        p_public_key: publicKeyInput.trim(),
        p_access_token: "",
        p_is_sandbox: isSandboxInput,
        p_is_active: false,
      });

      if (error) throw error;
      toast.info("Pagamentos automáticos desativados.");
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desativar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CreditCard className="size-6 text-primary" /> Pagamentos e Checkout
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o recebimento automático via <strong>PIX Dinâmico</strong> e <strong>Cartão de Crédito</strong>. O dinheiro das vendas vai direto para a sua conta.
        </p>
      </div>

      {loading ? (
        <Card className="p-8 text-center border-border/40">
          <Loader2 className="size-6 animate-spin mx-auto text-primary" />
          <p className="text-xs text-muted-foreground mt-2">Carregando status dos pagamentos...</p>
        </Card>
      ) : (
        <>
          {/* CARD DE STATUS DA CONEXÃO */}
          <Card className="border-border/50 bg-card overflow-hidden">
            <CardHeader className="p-5 border-b bg-muted/20">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`size-10 rounded-xl flex items-center justify-center ${
                      status?.isConfigured
                        ? "bg-emerald-500/20 text-emerald-600"
                        : "bg-amber-500/20 text-amber-600"
                    }`}
                  >
                    {status?.isConfigured ? (
                      <CheckCircle2 className="size-6" />
                    ) : (
                      <AlertTriangle className="size-6" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">
                      {status?.isConfigured
                        ? "Mercado Pago Conectado"
                        : "Mercado Pago Não Configurado"}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {status?.isConfigured
                        ? "Sua loja está habilitada para receber pagamentos automáticos com baixa na hora."
                        : "Conecte sua conta para começar a aceitar cartão e PIX dinâmico."}
                    </CardDescription>
                  </div>
                </div>

                {status?.isConfigured && (
                  <Badge
                    variant="outline"
                    className={
                      status.isSandbox
                        ? "border-amber-500/40 text-amber-600 bg-amber-500/10 font-bold"
                        : "border-emerald-500/40 text-emerald-600 bg-emerald-500/10 font-bold"
                    }
                  >
                    {status.isSandbox ? "Modo Teste (Sandbox)" : "Modo Produção"}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {status?.isConfigured ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="p-3 bg-muted/40 rounded-lg border">
                      <span className="text-muted-foreground block text-[11px]">Chave Pública (Public Key)</span>
                      <code className="font-mono font-semibold text-foreground truncate block mt-0.5">
                        {status.publicKey ? `${status.publicKey.slice(0, 15)}...${status.publicKey.slice(-6)}` : "Ativa"}
                      </code>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg border">
                      <span className="text-muted-foreground block text-[11px]">Token de Acesso (Access Token)</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1.5 mt-0.5">
                        <Lock className="size-3.5" /> Protegido e Conectado com sucesso
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={saving}
                      className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                    >
                      Desconectar conta
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadStatus}
                      className="text-xs text-muted-foreground gap-1.5"
                    >
                      <RefreshCw className="size-3.5" /> Atualizar status
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                    <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-foreground">Como funciona o recebimento?</p>
                      <p className="text-muted-foreground leading-relaxed">
                        Ao conectar suas credenciais, quando o cliente comprar na sua loja, o pagamento cairá <strong>diretamente no seu Mercado Pago</strong>. O sistema identifica o pagamento no mesmo segundo e aprova a reserva automaticamente.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* FORMULÁRIO DE CONFIGURAÇÃO DE CREDENCIAIS */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="p-5 border-b">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <KeyRound className="size-4 text-primary" /> Credenciais da Aplicação
              </CardTitle>
              <CardDescription className="text-xs">
                Insira as credenciais geradas na sua conta do Mercado Pago Developers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Public Key</Label>
                  <Input
                    placeholder="APP_USR-... ou TEST-..."
                    value={publicKeyInput}
                    onChange={(e) => setPublicKeyInput(e.target.value)}
                    required
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Access Token {status?.hasToken && <span className="text-muted-foreground font-normal">(Deixe em branco para manter o atual)</span>}
                  </Label>
                  <Input
                    type="password"
                    placeholder={status?.hasToken ? "••••••••••••••••••••••••••••••••" : "APP_USR-... ou TEST-..."}
                    value={accessTokenInput}
                    onChange={(e) => setAccessTokenInput(e.target.value)}
                    required={!status?.hasToken}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                  <div>
                    <Label className="text-xs font-semibold block">Modo Sandbox (Ambiente de Testes)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Mantenha ativado enquanto estiver testando com cartões de teste do Mercado Pago.
                    </p>
                  </div>
                  <Switch
                    checked={isSandboxInput}
                    onCheckedChange={setIsSandboxInput}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 gap-2"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Salvar Credenciais
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
