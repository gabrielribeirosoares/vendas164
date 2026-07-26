import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Package, Share2, Wallet } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroImage from "@/assets/hero-miniaturas.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vendas 164 — Pré-vendas e Reservas de Miniaturas 1/64" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, estoque, sinais e saldos de miniaturas colecionáveis. Lojistas vendem, colecionadores acompanham cada reserva.",
      },
      { property: "og:title", content: "Vendas 164 — Pré-vendas de miniaturas" },
      {
        property: "og:description",
        content: "Pré-vendas, controle de cotas e financeiro para lojas de carros em miniatura.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <main className="flex-1">
        <section className="hero-surface border-b border-border/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center md:py-20">
            <div>
              <Badge variant="outline" className="border-primary/40 text-primary">
                Plataforma 1/64
              </Badge>
              <h1 className="mt-4 text-4xl font-bold leading-[1.05] md:text-5xl">
                Pré-vendas de miniaturas sem planilha, sem confusão.
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted-foreground">
                Cadastre cotas, defina o prazo do sinal, acompanhe o saldo a receber e deixe o
                colecionador acompanhar tudo e copiar o PIX em 1 clique.
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

        <section className="mx-auto max-w-6xl px-4 py-14 pb-20">
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
      </main>

      <AppFooter />
    </div>
  );
}
