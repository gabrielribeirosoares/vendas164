import { createFileRoute } from "@tanstack/react-router";
import { ProductView } from "./loja.$slug.$itemSlug";

export const Route = createFileRoute("/produto/$id")({
  component: ProductPageForSubdomain,
});

function ProductPageForSubdomain() {
  const { id } = Route.useParams();
  return <ProductView itemSlug={id} />;
}
