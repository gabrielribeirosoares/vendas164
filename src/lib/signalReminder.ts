export const SIGNAL_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
export function isSignalDueSoon(
  order: {
    payment_status: string;
    delivery_status: string;
    reservation_expires_at: string | null;
  },
  now = Date.now(),
) {
  const remaining = Date.parse(order.reservation_expires_at || "") - now;
  return (
    order.payment_status === "aguardando_sinal" &&
    order.delivery_status !== "cancelado" &&
    Number.isFinite(remaining) &&
    remaining > 0 &&
    remaining <= SIGNAL_REMINDER_WINDOW_MS
  );
}

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(
        url.hostname,
      ) ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
