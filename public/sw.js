const CACHE_NAME = "vendas164-pwa-v1";
const IMAGE_CACHE_NAME = "vendas164-images-v1";
const IMAGE_CACHE_LIMIT = 300;
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/pwa-icon-192.png",
  "/icons/pwa-icon-512.png",
  "/icons/pwa-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("vendas164-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSupabaseStorageImage =
    request.destination === "image" &&
    url.hostname.endsWith(".supabase.co") &&
    (url.pathname.startsWith("/storage/v1/object/") || url.pathname.startsWith("/storage/v1/render/image/"));

  if (isSupabaseStorageImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok || response.type === "opaque") {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > IMAGE_CACHE_LIMIT) {
            await Promise.all(keys.slice(0, keys.length - IMAGE_CACHE_LIMIT).map((key) => cache.delete(key)));
          }
        }
        return response;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  const isStaticAsset = ["script", "style", "font"].includes(request.destination) || url.pathname.startsWith("/icons/");
  if (!isStaticAsset) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "Você tem uma nova atualização.",
      icon: "/icons/pwa-icon-192.png",
      badge: "/icons/pwa-icon.svg",
      vibrate: [100, 50, 100],
      data: {
        url: data.url || "/",
      },
    };

    event.waitUntil(self.registration.showNotification(data.title || "Vendas 164", options));
  } catch (error) {
    console.error("[SW] Erro ao processar notificação push:", error);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Tenta encontrar uma janela aberta com a URL ou da mesma origem
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Se não encontrou, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
