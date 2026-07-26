import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Package, Share2, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { joinWaitlist, reservationErrorMessage, reserveQuota } from "@/lib/reservations";

export const Route = createFileRoute("/produto/$id")({
  head: () => ({
    meta: [
      { title: "Pré-venda de miniatura — MiniPré" },
      {
        name: "description",
        content: "Detalhes da pré-venda: preço, cotas disponíveis, prazo do sinal e reserva.",
      },
      { property: "og:title", content: "Pré-venda de miniatura — MiniPré" },
      { property: "og:description", content: "Reserve sua cota desta miniatura colecionável." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, stores(id, name, slug, primary_color, whatsapp_number)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: onWaitlist } = useQuery({
    queryKey: ["waitlist", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("waitlist")
        .select("id")
        .eq("product_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });

  async function handleReserve() {
    if (!product) return;
    if (!user) {
      navigate({ to: "/auth", search: { produto: id, loja: product.store_id } });
      return;
    }
    if (product.stores?.owner_id === user.id) {
      toast.info("Você é o dono desta loja e não pode reservar cotas na sua própria pré-venda.");
      return;
    }
    try {
      if (product.stock > 0) {
        await reserveQuota(product.id);
        toast.success("Cota reservada! Envie o sinal dentro do prazo.");
      } else {
        await joinWaitlist(user.id, product.id, product.store_id);
        toast.success("Você entrou na fila de espera.");
      }
      queryClient.invalidateQueries();
      navigate({ to: "/painel" });
    } catch (error) {
      toast.error(reservationErrorMessage(error));
    }
  }

  function share() {
    navigator.clipboard.writeText(`${window.location.origin}/produto/${id}`);
    toast.success("Link do produto copiado!");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Produto não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-border/60 panel">
            <div className="aspect-square w-full bg-muted">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={`${product.brand} ${product.model}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Package className="size-12" />
                </div>
              )}
            </div>
          </div>

          <div>
            <Link
              to="/loja/$slug"
              params={{ slug: product.stores?.slug ?? "" }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <StoreIcon className="size-4" /> {product.stores?.name}
            </Link>
            <h1 className="mt-2 text-3xl font-bold">{product.model}</h1>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              {product.brand} · escala {product.scale}
            </p>

            <p className="mt-6 font-display text-4xl font-bold text-primary">
              {brl(Number(product.price))}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant={product.is_open ? "secondary" : "outline"}>
                {product.is_open ? "Pré-venda aberta" : "Pré-venda fechada"}
              </Badge>
              <Badge variant="outline">
                {product.stock > 0 ? `${product.stock} cotas disponíveis` : "Cotas esgotadas"}
              </Badge>
            </div>

            <Card className="mt-6 border-border/60 panel">
              <CardContent className="space-y-3 p-5 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-4 text-primary" />
                  Prazo para pagar o sinal: {product.payment_deadline_hours}h após a reserva
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4 text-primary" />
                  Previsão de chegada:{" "}
                  {product.release_date
                    ? new Date(product.release_date + "T00:00:00").toLocaleDateString("pt-BR")
                    : "a definir"}
                </p>
              </CardContent>
            </Card>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="flex-1 glow"
                onClick={handleReserve}
                disabled={!product.is_open || onWaitlist === true}
              >
                {!product.is_open
                  ? "Pré-venda fechada"
                  : onWaitlist
                    ? "Você está na fila"
                    : product.stock > 0
                      ? "Reservar cota"
                      : "Entrar na fila de espera"}
              </Button>
              <Button size="lg" variant="secondary" onClick={share}>
                <Share2 className="size-4" /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
