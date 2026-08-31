import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, ExternalLink, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  trackMultipleOrders,
  getTrackingStatusLabel,
  shouldUpdateDeliveryStatus,
  type TrackingResult,
} from "@/lib/trackingService";

interface TrackingIntegrationProps {
  storeId: string;
}

type TrackingCacheEntry = {
  result: TrackingResult | null;
  timestamp: number;
  tracked: boolean;
};

const CACHE_KEY = "tracking_cache_v1";
const CACHE_DURATION = 5 * 60 * 1000;
const BATCH_SIZE = 5;

function getCacheKey(storeId: string): string {
  return `${CACHE_KEY}_${storeId}`;
}

function getCachedTrackings(storeId: string): Map<string, TrackingCacheEntry> {
  try {
    const raw = localStorage.getItem(getCacheKey(storeId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveCachedTrackings(storeId: string, cache: Map<string, TrackingCacheEntry>): void {
  try {
    const obj = Object.fromEntries(cache);
    localStorage.setItem(getCacheKey(storeId), JSON.stringify(obj));
  } catch (err) {
    console.error("[TrackingIntegration] Failed to save cache:", err);
  }
}

function isCacheValid(entry: TrackingCacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

export function TrackingIntegration({ storeId }: TrackingIntegrationProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [results, setResults] = useState<Map<string, TrackingResult>>(new Map());

  const loadCachedResults = useCallback(() => {
    const cache = getCachedTrackings(storeId);
    const validResults = new Map<string, TrackingResult>();
    for (const [code, entry] of cache.entries()) {
      if (isCacheValid(entry) && entry.result) {
        validResults.set(code, entry.result);
      }
    }
    setResults(validResults);
  }, [storeId]);

  useEffect(() => {
    loadCachedResults();
  }, [loadCachedResults]);

  async function handleRefreshAll() {
    setLoading(true);
    setProgress({ current: 0, total: 0 });

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, tracking_code, delivery_status, payment_status")
      .eq("store_id", storeId)
      .not("tracking_code", "is", null);

    if (ordersError) {
      setLoading(false);
      toast.error("Erro ao carregar pedidos: " + ordersError.message);
      return;
    }

    const ordersWithTracking =
      orders?.filter((o) => o.tracking_code && o.tracking_code.trim()) ?? [];
    if (ordersWithTracking.length === 0) {
      setLoading(false);
      toast.info("Nenhum código de rastreio encontrado para atualizar.");
      return;
    }

    setProgress({ current: 0, total: ordersWithTracking.length });
    const cache = getCachedTrackings(storeId);
    const newResults = new Map<string, TrackingResult>();
    let updated = 0;
    let currentIndex = 0;

    for (let i = 0; i < ordersWithTracking.length; i += BATCH_SIZE) {
      const batch = ordersWithTracking.slice(i, i + BATCH_SIZE).map((o) => o.tracking_code!);
      const batchResults = await trackMultipleOrders(batch);

      for (const [code, result] of batchResults.entries()) {
        newResults.set(code, result);
        cache.set(code, {
          result,
          timestamp: Date.now(),
          tracked: true,
        });

        const ordersToUpdate = ordersWithTracking.filter(
          (o) => o.tracking_code!.toUpperCase().trim() === code,
        );

        for (const order of ordersToUpdate) {
          if (shouldUpdateDeliveryStatus(result)) {
            // Se já está entregue, nunca rebaixa para em trânsito
            if (order.delivery_status === "entregue" && result.status !== "delivered") {
              continue;
            }
            const newStatus = result.status === "delivered" ? "entregue" : "em_transito";
            if (order.delivery_status !== newStatus) {
              await supabase
                .from("orders")
                .update({ delivery_status: newStatus })
                .eq("id", order.id);
              updated++;
            }
          }
        }
      }

      currentIndex += batch.length;
      setProgress({ current: currentIndex, total: ordersWithTracking.length });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    saveCachedTrackings(storeId, cache);
    setResults(newResults);
    setLastUpdate(new Date());
    setProgress(null);
    setLoading(false);

    await queryClient.invalidateQueries();
    toast.success(`${updated} de ${ordersWithTracking.length} pedidos atualizados com novo status de envio.`);
  }

  return (
    <Card className="border-border/60 panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <RefreshCw className="size-5 text-primary" />
          Integração de Rastreamento Automático
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert className="border-blue-500/20 bg-blue-500/5">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs text-muted-foreground">
            Esta integração consulta automaticamente o status de rastreamento dos Correios e
            atualiza o status de envio dos pedidos. Funciona com códigos de rastreio válidos dos
            Correios.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={handleRefreshAll}
            disabled={loading}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Atualizar Todos os Rastreios
              </>
            )}
          </Button>

          {lastUpdate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              Última atualização: {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>

        {progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Processando {progress.current} de {progress.total} códigos
              </span>
              <span className="text-muted-foreground">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        )}

        {results.size > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="size-4" />
              Rastreios Ativos ({results.size})
            </h4>
            <div className="space-y-2">
              {Array.from(results.entries()).map(([code, result]) => (
                <div key={code} className="rounded-lg border border-border/40 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <code className="bg-muted/30 px-2 py-0.5 rounded font-mono text-xs">
                        {code.slice(0, 12)}...
                      </code>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-5 ${
                          result.status === "delivered"
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                            : result.status === "in_transit"
                              ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                              : "bg-muted/30 text-muted-foreground border-border/40"
                        }`}
                      >
                        {getTrackingStatusLabel(result.status)}
                      </Badge>
                    </div>
                    <a
                      href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(code)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="Rastrear no site dos Correios"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>

                  {result.events.length > 0 && (
                    <div className="space-y-1.5 ml-1 border-l border-border/30 pl-2">
                      {result.events.slice(0, 3).map((event, idx) => (
                        <div key={idx} className="text-[10px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {event.date} {event.time}
                          </span>{" "}
                          - {event.location}
                          <p className="truncate">{event.details || event.status}</p>
                        </div>
                      ))}
                      {result.events.length > 3 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          +{result.events.length - 3} eventos anteriores
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
