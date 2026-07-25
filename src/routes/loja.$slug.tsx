import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Package, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/loja/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Loja ${params.slug} — pré-vendas de miniaturas | MiniPré` },
      {
        name: "description",
        content: `Veja as pré-vendas abertas e reserve sua cota na loja ${params.slug}.`,
      },
      { property: "og:title", content: `Loja ${params.slug} — MiniPré` },
      { property: "og:description", content: "Pré-vendas abertas de miniaturas colecionáveis." },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["store", slug],
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("stores")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      return { store, products: products ?? [] };
    },
  });

  async function follow() {
    if (!data?.store) return;
    if (!user) {
      navigate({ to: "/auth", search: { loja: data.store.id, next: `/loja/${slug}` } });
      return;
    }
    await supabase
      .from("customer_store_link")
      .insert({ user_id: user.id, store_id: data.store.id });
    queryClient.invalidateQueries();
    toast.success("Loja adicionada às suas lojas seguidas.");
  }

  function copyInvite() {
    if (!data?.store) return;
    const url = `${window.location.origin}/auth?loja=${data.store.id}&next=/loja/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link de convite copiado!");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando loja…</p>
      </div>
    );
  }

  if (!data?.store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Loja não encontrada.</p>
      </div>
    );
  }

  const { store, products } = data;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div
          className="rounded-3xl border border-border/60 p-6 panel"
          style={{ borderTopColor: store.primary_color, borderTopWidth: 4 }}
        >
          <div className="flex flex-wrap items-center gap-4">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={`Logo ${store.name}`}
                className="size-16 rounded-2xl object-cover"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <StoreIcon className="size-7" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{store.name}</h1>
              <p className="text-sm text-muted-foreground">
                {store.description ?? "Pré-vendas de miniaturas colecionáveis"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={copyInvite}>
                <Copy className="size-4" /> Link de convite
              </Button>
              <Button onClick={follow}>Seguir loja</Button>
            </div>
          </div>
        </div>

        <h2 className="mt-10 text-xl font-bold">Pré-vendas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Link key={p.id} to="/produto/$id" params={{ id: p.id }} className="group">
              <Card className="h-full overflow-hidden border-border/60 panel transition-transform group-hover:-translate-y-1">
                <div className="aspect-video w-full overflow-hidden bg-muted">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={`${p.brand} ${p.model}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="size-8" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {p.brand} · {p.scale}
                  </p>
                  <h3 className="mt-1 font-semibold">{p.model}</h3>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-primary">
                      {brl(Number(p.price))}
                    </span>
                    <Badge variant={p.is_open ? "secondary" : "outline"}>
                      {p.is_open ? `${p.stock} cotas` : "Fechada"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma pré-venda cadastrada ainda.</p>
          )}
        </div>
      </main>
    </div>
  );
}
