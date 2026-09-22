import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { savePushSubscriptionServer } from "@/lib/push";

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

export function PushNotificationManager({ storeId }: { storeId?: string }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  async function checkSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking subscription", error);
    }
  }

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

  if (!isSupported) return null;

  if (isSubscribed) {
    return (
      <Button variant="ghost" size="sm" className="gap-1 px-3 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950" disabled>
        <Bell className="size-4" />
        <span className="hidden sm:inline">Notificações Ativas</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 px-3"
      onClick={subscribeToPush}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <BellOff className="size-4 text-muted-foreground" />
      )}
      <span className="hidden sm:inline">Ativar Notificações</span>
    </Button>
  );
}
