import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSignalEmailPreference, setSignalEmailPreference } from "@/lib/signalEmailPreferences";

export function SignalEmailPreference() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getSignalEmailPreference>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      const current = ++revision.current;
      setState(null);
      setLoading(true);
      setFailed(false);
      try {
        const result = await getSignalEmailPreference();
        if (!disposed && current === revision.current) setState(result);
      } catch {
        if (!disposed && current === revision.current) setFailed(true);
      } finally {
        if (!disposed && current === revision.current) setLoading(false);
      }
    }
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION") void refresh();
    });
    return () => {
      disposed = true;
      revision.current++;
      data.subscription.unsubscribe();
    };
  }, []);

  async function toggle() {
    if (!state) return;
    const current = revision.current;
    const enabled = !state.enabled;
    setLoading(true);
    try {
      await setSignalEmailPreference({ data: { enabled } });
      if (current !== revision.current) return;
      setState({ ...state, enabled });
      toast.success(
        enabled
          ? "Lembretes de sinal por e-mail autorizados."
          : "Lembretes por e-mail desativados.",
      );
    } catch {
      if (current === revision.current)
        toast.error("Não foi possível salvar sua preferência. Tente novamente.");
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <h4 className="text-sm font-medium">Lembretes de sinal por e-mail</h4>
      {loading && !state ? (
        <p className="text-xs text-muted-foreground" role="status">
          Carregando preferência…
        </p>
      ) : failed ? (
        <p className="text-xs text-muted-foreground">
          Não foi possível consultar sua preferência. Feche e abra o sino para tentar novamente.
        </p>
      ) : !state?.available ? (
        <p className="text-xs text-muted-foreground">
          Os lembretes por e-mail ainda não estão disponíveis.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground break-words">
            {state.email
              ? `Usar ${state.email} para avisar sobre sinais próximos do vencimento, em vez do push. Sem mensagens promocionais. Você pode desativar aqui.`
              : "Confirme o e-mail da sua conta para autorizar lembretes."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={toggle}
            disabled={loading || (!state.enabled && !state.email)}
            className="w-full"
            aria-pressed={state.enabled}
          >
            {loading
              ? "Salvando…"
              : state.enabled
                ? "Desativar lembretes por e-mail"
                : "Autorizar lembretes por e-mail"}
          </Button>
        </>
      )}
    </div>
  );
}
