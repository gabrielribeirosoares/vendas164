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
export type PackingLine = {
  key: string;
  orderIds: string[];
  productName: string;
  brand: string;
  variantName: string | null;
  imageUrl: string | null;
  sku: string | null;
  quantity: number;
  available: boolean;
  releaseDate: string | null;
};
export type CustomerPackage = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  lines: PackingLine[];
  quantity: number;
};
export type PackingPage = { groups: Array<{ order: PackingOrder; ids: string[] }>; total: number };

export async function loadPackingOrders(fetchPage: (page: number) => Promise<PackingPage>) {
  const orders = new Map<string, PackingOrder>();
  let total = 0;
  for (let page = 1; page === 1 || (page - 1) * 100 < total; page++) {
    const result = await fetchPage(page);
    total = result.total;
    for (const group of result.groups)
      for (const id of group.ids) orders.set(id, { ...group.order, id });
  }
  return [...orders.values()];
}

export function groupCustomerPackages(orders: PackingOrder[], today: string): CustomerPackage[] {
  const customers = new Map<string, CustomerPackage>();
  const seen = new Set<string>();
  for (const order of orders) {
    if (
      seen.has(order.id) ||
      order.payment_status !== "quitado" ||
      ["enviado", "em_transito", "entregue", "cancelado"].includes(order.delivery_status)
    )
      continue;
    const releaseDate = order.products?.release_date?.slice(0, 10) || null;
    const available = !releaseDate || releaseDate <= today;
    seen.add(order.id);
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
    let customer = customers.get(key);
    if (!customer) {
      customer = {
        key,
        name: isGuest
          ? guest?.name || (phone ? `Convidado (${phone})` : "Convidado sem nome")
          : order.profiles?.name || order.profiles?.email?.split("@")[0] || "Cliente sem nome",
        phone,
        email: isGuest ? null : order.profiles?.email || null,
        lines: [],
        quantity: 0,
      };
      customers.set(key, customer);
    }
    const lineKey = `${order.product_id}:${order.variant_id || ""}:${order.variant_name || ""}`;
    let line = customer.lines.find((line) => line.key === lineKey);
    if (!line) {
      line = {
        key: lineKey,
        orderIds: [],
        productName: order.products?.model || "Miniatura",
        brand: order.products?.brand || "",
        variantName: order.variant_name || null,
        imageUrl: order.variant_image_url || order.products?.image_url || null,
        sku: order.products?.sku || null,
        available,
        releaseDate,
        quantity: 0,
      };
      customer.lines.push(line);
    }
    line.orderIds.push(order.id);
    line.quantity++;
    customer.quantity++;
  }
  return [...customers.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((customer) => ({
      ...customer,
      lines: customer.lines.sort((a, b) =>
        `${a.brand} ${a.productName} ${a.variantName || ""}`.localeCompare(
          `${b.brand} ${b.productName} ${b.variantName || ""}`,
          "pt-BR",
        ),
      ),
    }));
}
