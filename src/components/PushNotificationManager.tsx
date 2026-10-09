import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { savePushSubscriptionServer, checkPushSubscriptionServer, removePushSubscriptionServer } from "@/lib/push";

import { supabase } from "@/integrations/supabase/client";

function urlB64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager({ storeId, showLabel = false }: { storeId?: string; showLabel?: boolean }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator && "PushManager" in window)) return;
    setIsSupported(true);
    let disposed = false;
    let revision = 0;
    async function checkSubscription() {
      const current = ++revision;
      setIsSubscribed(false);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const active = subscription && Notification.permission === "granted"
          ? await checkPushSubscriptionServer({ data: { endpoint: subscription.endpoint } })
          : false;
        if (!disposed && current === revision) setIsSubscribed(!!active);
      } catch {
        if (!disposed && current === revision) setIsSubscribed(false);
      }
    }
    void checkSubscription();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void checkSubscription();
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, [storeId]);

  async function subscribeToPush() {
    setIsLoading(true);
    try {
      if (Notification.permission === "denied") {
        toast.error("Notificações bloqueadas. Clique no cadeado na barra de endereços > Notificações > Permitir, e recarregue a página.");
        setIsLoading(false);
        return;
      }

      const permission = await Notification.requestPermission();
      
      if (permission === "denied") {
        toast.error("Notificações bloqueadas pelo navegador. Clique no cadeado (🔒) na barra de endereços → Notificações → Permitir, e recarregue a página.", { duration: 8000 });
        setIsLoading(false);
        return;
      }
      
      if (permission === "default") {
        toast.error("O navegador suprimiu o popup de permissão. Clique no cadeado (🔒) na barra de endereços → Notificações → Permitir, e recarregue a página.", { duration: 8000 });
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Chave pública VAPID (deve ser a mesma do servidor)
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("push_not_configured");
      const applicationServerKey = urlB64ToUint8Array(vapidKey);

      const existing = await registration.pushManager.getSubscription();
      const existingKey = existing?.options.applicationServerKey;
      if (existing && (!existingKey ||
        new Uint8Array(existingKey).length !== applicationServerKey.length ||
        !new Uint8Array(existingKey).every((value, index) => value === applicationServerKey[index]))) {
        await existing.unsubscribe();
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const subscriptionData = subscription.toJSON();

      if (!subscriptionData.endpoint || !subscriptionData.keys) {
        throw new Error("Invalid subscription data generated");
      }

      await savePushSubscriptionServer({
        data: {
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
          user_agent: navigator.userAgent,
          store_id: storeId,
        }
      });

      setIsSubscribed(true);
      toast.success("Notificações ativadas com sucesso!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message === "push_not_configured"
          ? "As notificações ainda não foram configuradas para este ambiente."
          : "Não foi possível ativar as notificações. Verifique as permissões e tente novamente."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribeFromPush() {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionServer({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success("Notificações desativadas neste dispositivo.");
    } catch {
      toast.error("Não foi possível desativar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isSupported) return null;

  if (isSubscribed) {
    return (
      <Button variant="ghost" size="sm" className="gap-1 px-3 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950" onClick={unsubscribeFromPush} disabled={isLoading} aria-label="Desativar notificações neste dispositivo">
        <Bell className="size-4" />
        <span className={showLabel ? "inline" : "hidden sm:inline"}>Desativar notificações</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 px-3"
      aria-label="Receber notificações neste dispositivo"
      onClick={subscribeToPush}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <BellOff className="size-4 text-muted-foreground" />
      )}
      <span className={showLabel ? "inline" : "hidden sm:inline"}>Receber notificações</span>
    </Button>
  );
}
