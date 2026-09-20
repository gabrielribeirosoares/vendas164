import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "vendas164_pwa_install_dismissed_at";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < DISMISS_DURATION) return;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowIosHelp(false);
      setVisible(true);
    };
    const handleInstalled = () => {
      setInstallEvent(null);
      setVisible(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if (isIosDevice()) {
      setShowIosHelp(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.removeItem(DISMISS_KEY);
    }
    setInstallEvent(null);
    setVisible(false);
  };

  if (!visible || (!installEvent && !showIosHelp)) return null;

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur supports-[padding:max(0px)]:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="Instalar aplicativo Vendas 1:64"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Fechar aviso de instalação"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-7">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {showIosHelp ? <Share2 className="size-5" /> : <Download className="size-5" />}
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Instalar Vendas 1:64</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {showIosHelp
              ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
              : "Acesse suas lojas, reservas e produtos como um aplicativo no seu aparelho."}
          </p>
        </div>
      </div>

      {installEvent && (
        <Button type="button" onClick={() => void install()} className="mt-3 w-full gap-2 font-semibold">
          <Download className="size-4" /> Instalar aplicativo
        </Button>
      )}
    </aside>
  );
}
