import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/produto/$id")({
  loader: async ({ params }) => {
    const { id } = params;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data: product } = await supabase
      .from("products")
      .select("id, slug, stores(slug)")
      .eq(isUuid ? "id" : "slug", id)
      .maybeSingle();

    if (product) {
      const storeSlug = product.stores?.slug || "loja";
      const itemSlug = product.slug || product.id;

      throw redirect({
        to: "/loja/$slug/$itemSlug",
        params: { slug: storeSlug, itemSlug: itemSlug },
      });
    }

    throw redirect({
      to: "/",
    });
  },
  component: () => null,
});
