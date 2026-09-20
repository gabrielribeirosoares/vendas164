export const DEFAULT_APP_FAVICON = "/icons/favicon-32.png";

export function updateAppFavicon(iconUrl: string | null | undefined) {
  if (typeof document === "undefined") return;
  try {
    const resolvedIconUrl = iconUrl || DEFAULT_APP_FAVICON;
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
    link.type = resolvedIconUrl.endsWith(".ico") ? "image/x-icon" : "image/png";
    link.href = resolvedIconUrl;

    if (iconUrl) {
      const ogMeta = document.querySelector<HTMLMetaElement>("meta[property='og:image']");
      if (ogMeta) {
        ogMeta.setAttribute("content", iconUrl);
      }
      const twMeta = document.querySelector<HTMLMetaElement>("meta[name='twitter:image']");
      if (twMeta) {
        twMeta.setAttribute("content", iconUrl);
      }
    }
  } catch (err) {
    console.warn("[updateAppFavicon] Error updating favicon:", err);
  }
}
