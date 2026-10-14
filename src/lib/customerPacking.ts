export type PackingOrder = {
  id: string;
  user_id: string;
  product_id: string;
  payment_status: string;
  delivery_status: string;
  pix_key?: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  variant_image_url?: string | null;
  profiles?: { name: string | null; email: string | null; phone: string | null } | null;
  products?: {
    model: string;
    brand: string;
    image_url: string | null;
    release_date: string | null;
    sku?: string | null;
  } | null;
};
export function packingCustomerIdentity(order: PackingOrder) {
  let guest: { name?: string; phone?: string } | null = null;
  const raw = order.pix_key || "";
  const isGuest = raw.startsWith("GUEST:") || raw.startsWith('{"manual_guest":true');
  try {
    if (isGuest) {
      const parsed = JSON.parse(raw.startsWith("GUEST:") ? raw.slice(6) : raw);
      guest = {
        name: typeof parsed?.name === "string" ? parsed.name : undefined,
        phone: typeof parsed?.phone === "string" ? parsed.phone : undefined,
      };
    }
  } catch {
    guest = null;
  }
  const phone = isGuest ? guest?.phone || null : order.profiles?.phone || null;
  const key = isGuest
    ? `guest:${guest?.phone?.replace(/\D/g, "") || order.id}`
    : `user:${order.user_id}`;
  return {
    key,
    phone,
    name: isGuest
      ? guest?.name || (phone ? `Convidado (${phone})` : "Convidado sem nome")
      : order.profiles?.name || order.profiles?.email?.split("@")[0] || "Cliente sem nome",
    email: isGuest ? null : order.profiles?.email || null,
  };
}
