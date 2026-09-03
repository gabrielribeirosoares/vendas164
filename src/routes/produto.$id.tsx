import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { ProductView } from "./loja.$slug.$itemSlug";

const fetchProductById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    // Try by slug first, then by UUID
    let { data: product } = await supabase
      .from("products")
      .select("*, stores(id, name, slug, logo_url, favicon_url)")
      .eq("slug", data.id)
      .maybeSingle();

    if (!product) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id);
      if (isUuid) {
        const { data: fallback } = await supabase
          .from("products")
          .select("*, stores(id, name, slug, logo_url, favicon_url)")
          .eq("id", data.id)
          .maybeSingle();
        product = fallback;
      }
    }
    return product;
  });

export const Route = createFileRoute("/produto/$id")({
  loader: async ({ params }) => {
    const product = await fetchProductById({ data: { id: params.id } });
    return { product };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    const store = (product as any)?.stores;
    const title = product
      ? `${product.model} (${product.brand}) — ${store?.name || "Vendas 1:64"}`
      : "Pré-venda de miniatura — Vendas 1:64";
    const desc = product
      ? `Pré-venda de ${product.brand} ${product.model} por ${brl(product.price)}. Garanta sua unidade na loja ${store?.name || "Vendas 1:64"}!`
      : "Detalhes da pré-venda: preço, unidades disponíveis, prazo do sinal e reserva.";
    const img = product?.image_url || store?.logo_url || store?.favicon_url || "https://vendas164.com.br/og-image.png";
    const favicon = store?.favicon_url || store?.logo_url || undefined;

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: img },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: img },
      ],
      links: favicon ? [{ rel: "icon", href: favicon }] : [],
    };
  },
  component: ProductPageForSubdomain,
});

function ProductPageForSubdomain() {
  const { id } = Route.useParams();
  return <ProductView itemSlug={id} />;
}
