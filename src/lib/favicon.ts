export function updateAppFavicon(iconUrl: string | null | undefined) {
  if (!iconUrl || typeof document === "undefined") return;
  try {
    let link = document.getElementById("app-dynamic-favicon") as HTMLLinkElement | null;
    if (!link) {
      link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    }
    if (!link) {
      link = document.createElement("link");
      link.id = "app-dynamic-favicon";
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = iconUrl.endsWith(".ico") ? "image/x-icon" : "image/png";
    link.href = iconUrl;

    const ogMeta = document.querySelector<HTMLMetaElement>("meta[property='og:image']");
    if (ogMeta) {
      ogMeta.setAttribute("content", iconUrl);
    }
    const twMeta = document.querySelector<HTMLMetaElement>("meta[name='twitter:image']");
    if (twMeta) {
      twMeta.setAttribute("content", iconUrl);
    }
  } catch (err) {
    console.warn("[updateAppFavicon] Error updating favicon:", err);
  }
}
