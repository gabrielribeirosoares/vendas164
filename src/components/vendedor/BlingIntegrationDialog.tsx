import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, RefreshCw, CheckCircle2, AlertCircle, ArrowRight, Download, Search, Sparkles, Key, ExternalLink, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, slugify } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

import { fetchBlingProductsServer, exchangeBlingCodeServer, type BlingProductItem, type BlingTokenData } from "@/lib/bling";

interface BlingProduct extends BlingProductItem {}

// Credenciais padrão das lojas
const KNOWN_STORE_CREDS: Record<string, { clientId: string; clientSecret: string }> = {
  gabriel: {
    clientId: "a9edee22552004de6910069d7b6de18064bd313a",
    clientSecret: "aa8fcc07a56cfec1df445900ff89649db8b0c52eba1b38e49625d7b739cd",
  },
  mf: {
    clientId: "fc7160470be3728be6287c8f6e04d8f8c8718275",
    clientSecret: "01bce5db8c136fb793d844dcc8869ec0ed7b69e652c3adf2411cf200772b",
  },
};

export function BlingIntegrationDialog({
  storeId,
  storeName,
  open,
  onOpenChange,
}: {
  storeId: string;
  storeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [blingProducts, setBlingProducts] = useState<BlingProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [importMode, setImportMode] = useState<"pronta_entrega" | "pre_venda">("pronta_entrega");
  const [importing, setImporting] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const storeKey = storeName.toLowerCase().includes("mf") ? "mf" : "gabriel";
  const defaultCreds = KNOWN_STORE_CREDS[storeKey] || { clientId: "", clientSecret: "" };

  // Config e tokens salvos por loja
  const [tokens, setTokens] = useState<BlingTokenData | null>(() => {
    try {
      const saved = localStorage.getItem(`bling_tokens_${storeId}`);
      if (saved) return JSON.parse(saved);
      // Fallback para Gabriel se ainda não tiver token salvo
      if (storeKey === "gabriel") {
        return {
          access_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpZCI6ImYyYTBjMWQzZmQxMTljYTgwNTI4OWI5OGFiMTU1MDJjZTlhMDFiNmIiLCJqdGkiOiJmMmEwYzFkM2ZkMTE5Y2E4MDUyODliOThhYjE1NTAyY2U5YTAxYjZiIiwiaXNzIjpudWxsLCJhdWQiOiJhOWVkZWUyMjU1MjAwNGRlNjkxMDA2OWQ3YjZkZTE4MDY0YmQzMTNhIiwic3ViIjoiMTQ3ODUwMjY4MDQiLCJleHAiOjE3ODg0MjM4ODIsImlhdCI6MTc4ODQwMjI4MiwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjpudWxsLCJwZXJtIjoiMmU4MGEzMzg0ZTNlMDAwMDEwMDAwMGUxIiwiZ3JhbnRUeXBlcyI6ImF1dGhvcml6YXRpb25fY29kZSByZWZyZXNoX3Rva2VuIiwiYXBwX2lkIjoiMzk1MjY0IiwiY29tcGFueV9pZCI6MTQ5MTgxOTI3NjUsInJvbGUiOiJhZG0iLCJwbGFuX25hbWUiOiJQbGFub1RpdGFuaW9UaWVyMSIsImFwcHJvdmVkIjpmYWxzZX0.c5-B-lpnoPF4nouOxWuvYo9_xcfU9bxHP_zv-2_Uq7MfhQHn9SucK33pF8gnBaiadEPnKE_eBEQ0zax3oTIK5UUevaAVg6X0DNkCYgSAxPZ6DtFfqsLRxa9YkfD7zTOSLeob_lrH3yfSVnJci-yu2wh4W8ON5fjhn_vUAMUIvS-bQTKHCAEl0lulAI9vXIzELkJO6DV-wgsd8oXBD7LnCS0HdBeNGuMtFiYCOIT0FoiQvK5GnEuXlefj7jo20Ybydl7mwYMWMs9EzfSRoeGfS9sBhJTueN7rIiYWPzEh_v6h6khzbwVhsx0FRhNZWsRaLoUldSfD7a1TLWog0cZgsQ",
          refresh_token: "deebdf03de174a9e5c48f9847cc18d50026565af",
        };
      }
      return null;
    } catch {
      return null;
    }
  });

  const [formClientId, setFormClientId] = useState(defaultCreds.clientId);
  const [formClientSecret, setFormClientSecret] = useState(defaultCreds.clientSecret);
  const [authCodeInput, setAuthCodeInput] = useState("");

  const isConnected = !!tokens?.access_token;

  // Função para autenticar o código do Bling
  async function handleConnectWithCode() {
    if (!formClientId.trim() || !formClientSecret.trim()) {
      toast.error("Informe o Client ID e o Client Secret.");
      return;
    }

    let codeToUse = authCodeInput.trim();
    if (codeToUse.includes("code=")) {
      const match = codeToUse.match(/code=([^&]+)/);
      if (match) codeToUse = match[1];
    }

    if (!codeToUse) {
      toast.error("Cole o link ou código gerado pelo Bling.");
      return;
    }

    setAuthenticating(true);
    try {
      const tokenData = await exchangeBlingCodeServer({
        data: {
          clientId: formClientId.trim(),
          clientSecret: formClientSecret.trim(),
          code: codeToUse,
        },
      });

      if (!tokenData.access_token) {
        throw new Error("Não foi possível obter o token do Bling.");
      }

      setTokens(tokenData);
      localStorage.setItem(`bling_tokens_${storeId}`, JSON.stringify(tokenData));
      setShowConfig(false);
      setAuthCodeInput("");
      toast.success(`🎉 Bling conectado com sucesso para ${storeName}!`);

      // Buscar produtos automaticamente após conectar
      setTimeout(() => {
        fetchBlingProductsWithToken(tokenData);
      }, 300);
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar conta do Bling.");
    } finally {
      setAuthenticating(false);
    }
  }

  // Função interna para buscar produtos com tokens
  async function fetchBlingProductsWithToken(currentTokenData: BlingTokenData | null) {
    setLoadingProducts(true);
    try {
      const activeClientId = formClientId.trim() || defaultCreds.clientId;
      const activeClientSecret = formClientSecret.trim() || defaultCreds.clientSecret;

      const result = await fetchBlingProductsServer({
        data: {
          accessToken: currentTokenData?.access_token,
          refreshToken: currentTokenData?.refresh_token,
          clientId: activeClientId,
          clientSecret: activeClientSecret,
          limit: 100,
        },
      });

      if (result.newTokens) {
        setTokens(result.newTokens);
        localStorage.setItem(`bling_tokens_${storeId}`, JSON.stringify(result.newTokens));
      }

      setBlingProducts(result.products as BlingProduct[]);
      setSelectedProductIds([]);
      toast.success(`${result.products.length} produtos carregados do Bling!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao consultar produtos no Bling");
      setShowConfig(true);
    } finally {
      setLoadingProducts(false);
    }
  }

  function fetchBlingProducts() {
    fetchBlingProductsWithToken(tokens);
  }

  // Detecta marca com base no nome do produto
  function detectBrand(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("kaido")) return "Kaido House";
    if (lower.includes("mini gt") || lower.includes("minigt")) return "Mini GT";
    if (lower.includes("hot wheels") || lower.includes("hotwheels") || lower.includes("rlc")) return "Hot Wheels";
    if (lower.includes("pop race") || lower.includes("poprace")) return "Pop Race";
    if (lower.includes("tarmac")) return "Tarmac Works";
    if (lower.includes("inno64") || lower.includes("inno 64")) return "Inno64";
    if (lower.includes("matchbox")) return "Matchbox";
    if (lower.includes("greenlight")) return "Greenlight";
    if (lower.includes("spark")) return "Sparky";
    if (lower.includes("para64")) return "Para64";
    if (lower.includes("time micro") || lower.includes("timemicro")) return "Time Micro";
    return "Colecionáveis";
  }

  const filteredBlingProducts = blingProducts.filter((p) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase().trim();
    return p.nome.toLowerCase().includes(q) || (p.codigo && p.codigo.toLowerCase().includes(q));
  });

  // Itens a serem importados (respeita o filtro ativo)
  const itemsToImport = searchFilter.trim()
    ? filteredBlingProducts.filter((p) => selectedProductIds.includes(p.id))
    : blingProducts.filter((p) => selectedProductIds.includes(p.id));

  const isAllFilteredSelected =
    filteredBlingProducts.length > 0 &&
    filteredBlingProducts.every((p) => selectedProductIds.includes(p.id));

  function toggleSelectAllFiltered() {
    if (isAllFilteredSelected) {
      const filteredIds = new Set(filteredBlingProducts.map((p) => p.id));
      setSelectedProductIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredBlingProducts.map((p) => p.id);
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }

  // Importar os produtos selecionados para o banco de dados da loja
  async function handleImportProducts() {
    if (itemsToImport.length === 0) {
      toast.error("Selecione pelo menos um produto visível para importar.");
      return;
    }

    setImporting(true);
    try {
      let successCount = 0;

      for (const item of itemsToImport) {
        const brand = detectBrand(item.nome);
        const model = item.nome.replace(new RegExp(`^${brand}\\s*`, "i"), "").trim() || item.nome;
        const stockQty = Number(item.estoque?.saldoVirtualTotal ?? 1);
        const isPreVenda = importMode === "pre_venda";
        const slug = slugify(`${brand}-${model}`);

        const payload: any = {
          store_id: storeId,
          brand: brand,
          model: model,
          price: Number(item.preco || 0),
          stock: stockQty > 0 ? stockQty : 1,
          initial_stock: stockQty > 0 ? stockQty : 1,
          image_url: item.imagemURL || null,
          scale: "1:64",
          is_open: true,
          slug: slug,
          release_date: isPreVenda ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : null,
        };

        const { error } = await supabase.from("products").insert(payload);
        if (error) {
          console.error("Erro ao importar item:", item.nome, error);
        } else {
          successCount++;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["store-products", storeId] });
      toast.success(`🎉 ${successCount} produtos importados com sucesso para ${storeName}!`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || "Tente novamente"));
    } finally {
      setImporting(false);
    }
  }

  const authUrl = formClientId
    ? `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${formClientId}&state=${slugify(storeName)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500 fill-amber-500" />
              Integração Bling ERP &bull; {storeName}
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
                }
              >
                {isConnected ? "🟢 Conectado" : "🟡 Desconectado"}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setShowConfig(!showConfig)}
                title="Configurações e Reconexão"
              >
                <Settings className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            Importe itens cadastrados no seu Bling ERP direto para a sua loja com fotos, preços e estoque sincronizados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-0.5">
          {/* Card de Autorização quando não conectado ou clicou em configurações */}
          {(!isConnected || showConfig) && (
            <div className="bg-muted/40 p-3.5 rounded-xl border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                  <Key className="size-3.5 text-amber-500" />
                  Conectar Conta do Bling
                </span>
                {isConnected && (
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setShowConfig(false)}>
                    Fechar Config
                  </Button>
                )}
              </div>

              {/* Botão de Autorização e Campo de Código */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-background p-2.5 rounded-lg border border-border/40">
                  <div className="text-xs">
                    <span className="font-semibold block">1. Autorizar acesso no Bling</span>
                    <span className="text-muted-foreground text-[11px]">Abre a tela de permissão da conta no Bling</span>
                  </div>
                  {authUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 text-primary shrink-0 font-semibold"
                      onClick={() => window.open(authUrl, "_blank")}
                    >
                      <ExternalLink className="size-3.5" />
                      1. Abrir Autorização
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="2. Cole aqui o link ou código gerado (code=...)"
                    value={authCodeInput}
                    onChange={(e) => setAuthCodeInput(e.target.value)}
                    className="h-9 text-xs font-mono flex-1 bg-background"
                  />
                  <Button
                    size="sm"
                    className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 font-semibold"
                    onClick={handleConnectWithCode}
                    disabled={authenticating || !authCodeInput}
                  >
                    {authenticating ? "Conectando..." : "2. Conectar"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Painel de Produtos quando conectado */}
          {isConnected && (
            <div className="bg-muted/30 p-3 rounded-xl border border-border/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-semibold text-foreground block">Catálogo Oficial do Bling</span>
                  <span className="text-muted-foreground text-[11px]">Sincronização em tempo real via API v3</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-semibold"
                  onClick={fetchBlingProducts}
                  disabled={loadingProducts}
                >
                  <RefreshCw className={`size-3.5 ${loadingProducts ? "animate-spin" : ""}`} />
                  {blingProducts.length > 0 ? "Atualizar Lista do Bling" : "Buscar Produtos no Bling"}
                </Button>
              </div>

              {/* Configuração do Tipo de Importação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-border/30">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Importar catálogo como:</Label>
                  <Select value={importMode} onValueChange={(val: any) => setImportMode(val)}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pronta_entrega">⚡ Pronta Entrega (Em estoque)</SelectItem>
                      <SelectItem value="pre_venda">⏳ Pré-venda (Aguardando lote)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Filtrar produtos:</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar por nome ou SKU..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-7 text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lista de Produtos do Bling */}
          {blingProducts.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-semibold text-muted-foreground">
                  {filteredBlingProducts.length} miniaturas encontradas no Bling:
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-primary"
                  onClick={toggleSelectAllFiltered}
                >
                  {isAllFilteredSelected ? "Desmarcar Todos" : "Marcar Todos"}
                </Button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredBlingProducts.map((item) => {
                  const isSelected = selectedProductIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedProductIds((prev) =>
                          prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                        );
                      }}
                      className={`border rounded-xl p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/60 bg-card hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Checkbox checked={isSelected} onCheckedChange={() => {}} />

                        {item.imagemURL ? (
                          <img
                            src={item.imagemURL}
                            alt={item.nome}
                            className="size-11 rounded-lg object-cover border border-border/40 shrink-0"
                          />
                        ) : (
                          <div className="size-11 bg-muted rounded-lg flex items-center justify-center text-muted-foreground shrink-0">
                            <Package className="size-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-foreground truncate">{item.nome}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            {item.codigo && <span>SKU: {item.codigo}</span>}
                            <span>• Estoque: {item.estoque?.saldoVirtualTotal ?? 1} un</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-xs text-foreground block">{brl(item.preco)}</span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {detectBrand(item.nome)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isConnected && (
            <div className="text-center py-8 border border-dashed rounded-xl space-y-2 bg-muted/10">
              <Package className="size-8 mx-auto text-muted-foreground opacity-50" />
              <p className="text-xs text-muted-foreground">
                Clique no botão <strong>"Buscar Produtos no Bling"</strong> para carregar o catálogo da sua conta.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between pt-3 border-t border-border/40 shrink-0">
          <span className="text-xs text-muted-foreground">
            {itemsToImport.length} de {filteredBlingProducts.length} selecionados
          </span>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              onClick={handleImportProducts}
              disabled={importing || itemsToImport.length === 0}
            >
              <Download className="size-3.5" />
              {importing ? "Importando..." : `Importar (${itemsToImport.length}) para ${storeName}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
