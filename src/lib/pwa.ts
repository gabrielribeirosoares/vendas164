export function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return () => undefined;
  }

  const register = () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("[PWA] Não foi possível registrar o service worker.", error);
    });
  };

  if (document.readyState === "complete") {
    register();
    return () => undefined;
  }

  window.addEventListener("load", register, { once: true });
  return () => window.removeEventListener("load", register);
}
