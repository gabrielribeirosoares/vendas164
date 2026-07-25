import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Package, Share2, Store, Wallet } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import heroImage from "@/assets/hero-miniaturas.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MiniPré — Pré-vendas de miniaturas para lojas e colecionadores" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, estoque, sinais e saldos de miniaturas colecionáveis. Lojistas vendem, colecionadores acompanham cada reserva.",
      },
      { property: "og:title", content: "MiniPré — Pré-vendas de miniaturas" },
      {
        property: "og:description",
        content: "Pré-vendas, controle de cotas e financeiro para lojas de carros em miniatura.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: presales } = useQuery({
    queryKey: ["home-presales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, brand, model, scale, price, stock, image_url, stores(name, slug)")
        .eq("is_open", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main>
        <section className="hero-surface border-b border-border/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center md:py-20">
            <div>
              <Badge variant="outline" className="border-primary/40 text-primary">
                SaaS multi-lojas
              </Badge>
              <h1 className="mt-4 text-4xl font-bold leading-[1.05] md:text-5xl">
                Pré-vendas de miniaturas sem planilha, sem confusão.
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted-foreground">
                Cadastre cotas, defina o prazo do sinal, acompanhe o saldo a receber e deixe o
                colecionador enviar o comprovante direto no WhatsApp da loja.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg" className="glow">
                  <Link to="/vendedor">Abrir minha loja</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/painel">Sou colecionador</Link>
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-border/60 panel">
              <img
                src={heroImage}
                alt="Miniaturas colecionáveis 1:64 alinhadas sobre superfície escura"
                width={1600}
                height={1008}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Package, title: "Cotas e estoque", text: "Controle quantas peças restam em cada pré-venda." },
              { icon: Clock, title: "Prazo do sinal", text: "12h, 24h ou 48h com contagem regressiva automática." },
              { icon: Wallet, title: "Financeiro", text: "Projetado, sinal recebido e saldo a receber em tempo real." },
              { icon: Share2, title: "Links de convite", text: "Compartilhe a loja ou um produto e vincule o cliente." },
            ].map((item) => (
              <Card key={item.title} className="panel border-border/60">
                <CardContent className="p-5">
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <h2 className="text-2xl font-bold">Pré-vendas abertas agora</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos lançamentos publicados pelas lojas da plataforma.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(presales ?? []).map((p) => (
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
                    <h3 className="mt-1 text-base font-semibold">{p.model}</h3>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-display text-lg font-bold text-primary">
                        {brl(Number(p.price))}
                      </span>
                      <Badge variant={p.stock > 0 ? "secondary" : "outline"}>
                        {p.stock > 0 ? `${p.stock} cotas` : "Fila de espera"}
                      </Badge>
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Store className="size-3.5" />
                      {p.stores?.name}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {presales && presales.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma pré-venda aberta ainda. Seja a primeira loja da plataforma.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
