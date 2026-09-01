import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Clock,
  Package,
  Share2,
  Wallet,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  TrendingUp,
  XCircle,
  Check,
} from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import heroImage from "@/assets/hero-miniaturas.jpg";
import { useSubdomain } from "@/lib/subdomain";
import { StoreView } from "./loja.$slug";

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
        content: "Pré-vendas, controle de reservas e financeiro para lojas de carros em miniatura.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://vendas164.com.br/" }
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Vendas 164",
          "url": "https://vendas164.com.br/"
        })
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Vendas 164",
          "url": "https://vendas164.com.br/",
          "logo": "https://vendas164.com.br/og-image.png",
          "sameAs": [
            "https://www.instagram.com/vendas164.com.br"
          ]
        })
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Vendas 164 — Pré-vendas e Reservas de Miniaturas 1/64",
          "url": "https://vendas164.com.br/",
          "datePublished": "2025-01-15T00:00:00-03:00",
          "dateModified": "2026-08-30T00:00:00-03:00"
        })
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Início",
              "item": "https://vendas164.com.br/"
            }
          ]
        })
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Como funciona o Vendas 164?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "O lojista cadastra o lançamento com foto, preço e unidades disponíveis. Depois compartilha o link com seus colecionadores. O cliente escolhe a quantidade, paga o sinal via PIX e garante a reserva. Quando o lote chegar, o lojista notifica o comprador para receber o saldo restante."
              }
            },
            {
              "@type": "Question",
              "name": "Preciso pagar para usar a plataforma?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Para colecionadores, a plataforma é totalmente gratuita. Para lojistas, oferecemos 14 dias de teste grátis sem cartão de crédito, e planos por faixa de clientes a partir de R$ 150/mês."
              }
            },
            {
              "@type": "Question",
              "name": "Como o colecionador paga o sinal?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "O pagamento do sinal é feito via PIX com código copia e cola direto para o lojista."
              }
            },
            {
              "@type": "Question",
              "name": "O que acontece se eu não pagar o sinal no prazo?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Se o comprador não confirmar o pagamento do sinal até a data limite configurada pelo lojista (ex: 24h), a vaga é liberada automaticamente para outro colecionador."
              }
            }
          ]
        })
      }
    ]
  }),
  component: Home,
});

function Home() {
  const { subdomain } = useSubdomain();

  if (subdomain) {
    return <StoreView slug={subdomain} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <AppHeader />

        <main className="flex-1">
          {/* Hero Section */}
          <section className="hero-surface border-b border-border/30 relative overflow-hidden">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2 md:items-center md:py-20">
              <div className="space-y-6">
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 px-3 py-1 text-xs font-semibold gap-1.5 inline-flex items-center">
                  <Sparkles className="size-3.5" /> Plataforma Especializada em Miniaturas 1/64
                </Badge>
                
                <h1 className="text-4xl font-extrabold leading-[1.1] md:text-5xl tracking-tight">
                  Pré-vendas de miniaturas sem planilha.
                </h1>
                
                <p className="max-w-lg text-base md:text-lg text-muted-foreground leading-relaxed">
                  Cadastre unidades de pré-venda, garanta o recebimento do sinal via PIX, controle prazos automáticos de 24h e notifique seus colecionadores em 1 clique.
                </p>
                
                <div className="flex flex-wrap gap-3.5 pt-2">
                  <Button asChild size="lg" className="glow font-bold gap-2">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>
                      <ShoppingBag className="size-4" /> Criar Minha Loja (14 Dias Grátis)
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="secondary" className="font-semibold gap-2">
                    <Link to="/painel">
                      <UserCheck className="size-4 mr-1.5" /> Sou colecionador
                    </Link>
                  </Button>
                </div>

                <div className="pt-4 grid grid-cols-3 gap-3 border-t border-border/20 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    <span>Teste grátis sem cartão</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    <span>PIX copia e cola</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    <span>Aviso via WhatsApp</span>
                  </div>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/30 to-amber-500/20 blur-xl opacity-50 group-hover:opacity-75 transition duration-500"></div>
                <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/60 shadow-2xl">
                  <img
                    src={heroImage}
                    alt="Miniaturas colecionáveis 1:64 alinhadas sobre superfície escura"
                    width={1600}
                    height={1008}
                    className="h-full w-full object-cover transform group-hover:scale-105 transition duration-700"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Destaques / Funcionalidades da Plataforma */}
          <section className="mx-auto max-w-6xl px-4 py-16">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <Badge variant="outline" className="border-border text-muted-foreground mb-3">
                Recursos Principais
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Tudo o que você precisa para gerenciar pré-vendas com excelência
              </h2>
              <p className="mt-3 text-muted-foreground">
                Elimine planilhas manuais, evite o descontrole de reservas e mantenha seus colecionadores sempre informados.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Package,
                  title: "Unidades & Estoque em Pré-Venda",
                  text: "Defina o limite exato de unidades disponíveis para reserva em cada modelo 1/64. Evite overselling e mantenha o controle de peças restantes em tempo real.",
                },
                {
                  icon: Clock,
                  title: "Prazos & Cronômetro de Sinal",
                  text: "Defina uma data limite para confirmação do sinal. Caso o comprador não confirme até a data estipulada, a vaga é liberada automaticamente.",
                },
                {
                  icon: Wallet,
                  title: "Gestão Financeira & Saldo a Receber",
                  text: "Acompanhe faturamento projetado, valor já arrecadado em sinais e quanto você tem a receber assim que as miniaturas desembarcarem.",
                },
                {
                  icon: MessageSquare,
                  title: "Mensagens & Cobrança no WhatsApp",
                  text: "Envie lembretes de expiração de sinal e avisos de chegada da miniatura com mensagens formatadas contendo dados do pedido e chave PIX.",
                },
                {
                  icon: Share2,
                  title: "Links de Convite & Catálogo",
                  text: "Compartilhe o link direto da sua loja ou de um produto específico em grupos e redes sociais. Os colecionadores são vinculados diretamente a você.",
                },
                {
                  icon: ShieldCheck,
                  title: "Painel Exclusivo do Colecionador",
                  text: "Seu cliente consulta o status dos modelos encomendados, prazos de pagamento, fotos da miniatura e copia o código PIX sem complicação.",
                },
              ].map((item) => (
                <Card
                  key={item.title}
                  className="border-border/40 bg-card/40 hover:bg-card/80 hover:border-primary/40 transition-all duration-300 group"
                >
                  <CardContent className="p-6">
                    <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <item.icon className="size-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Ancoragem de ROI: Como a plataforma se paga sozinha */}
          <section className="border-t border-border/30 bg-gradient-to-b from-card/30 to-primary/5 py-16">
            <div className="mx-auto max-w-5xl px-4 space-y-10">
              <div className="text-center max-w-2xl mx-auto space-y-3">
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                  <TrendingUp className="size-3.5 mr-1" /> Retorno Garantido (ROI)
                </Badge>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  Por que o Vendas 164 se paga no primeiro lote?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Não veja o software como custo. Veja como uma ferramenta que estanca o prejuízo de miniaturas encalhadas por desistência.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* O método antigo */}
                <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8 space-y-4">
                  <div className="flex items-center gap-2.5 text-destructive font-bold text-lg">
                    <XCircle className="size-6 shrink-0" />
                    <span>Sem o Vendas 164 (WhatsApp & Caderno)</span>
                  </div>
                  <ul className="space-y-3 text-xs sm:text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-destructive font-bold">✕</span>
                      <span>Colecionador pede para reservar 2 Mini GT no WhatsApp e depois simplesmente não responde mais.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive font-bold">✕</span>
                      <span>Você fica com <strong>R$ 300+ de miniaturas paradas</strong> no estoque e capital travado.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive font-bold">✕</span>
                      <span>Horas gastas cobrando um por um e conferindo comprovantes bancários perdidos na galeria.</span>
                    </li>
                  </ul>
                </div>

                {/* Com o Vendas 164 */}
                <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-6 sm:p-8 space-y-4 shadow-lg shadow-emerald-500/5">
                  <div className="flex items-center gap-2.5 text-emerald-600 font-bold text-lg">
                    <CheckCircle2 className="size-6 shrink-0" />
                    <span>Com o Vendas 164 (Automatizado)</span>
                  </div>
                  <ul className="space-y-3 text-xs sm:text-sm text-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Sinal pago antecipadamente no PIX:</strong> Quem reserva tem compromisso financeiro real.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Vagas liberadas em 24h:</strong> Se não pagar o sinal no prazo, outro comprador da fila assume a vaga.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>1 única desistência evitada já paga a mensalidade</strong> da plataforma!</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Tabela de Planos e Preços */}
          <section className="border-t border-border/30 py-16">
            <div className="mx-auto max-w-6xl px-4">
              <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
                <Badge variant="outline" className="border-primary/30 text-primary mb-2">
                  Planos por Quantidade de Clientes
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Planos transparentes que acompanham o seu crescimento
                </h2>
                <p className="mt-2 text-muted-foreground text-sm">
                  Escolha a faixa de colecionadores da sua loja. Todos os planos incluem <strong>14 dias de teste grátis</strong> sem necessidade de cartão de crédito.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 items-stretch">
                {/* Plano 1: Até 100 clientes */}
                <div className="rounded-3xl border border-border/60 bg-card/60 p-7 space-y-6 flex flex-col justify-between hover:border-border transition-all">
                  <div className="space-y-4">
                    <Badge variant="outline" className="text-xs border-muted-foreground/40">
                      Iniciante
                    </Badge>
                    <div>
                      <h3 className="text-xl font-bold">Até 100 Clientes</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Para lojistas iniciando ou vendedores individuais</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-foreground">R$ 150</span>
                      <span className="text-xs text-muted-foreground">/ mês</span>
                    </div>

                    <ul className="space-y-2.5 text-xs text-muted-foreground pt-2">
                      {[
                        "Até 100 colecionadores vinculados",
                        "Pré-vendas e lançamentos ILIMITADOS",
                        "Controle de sinal automático via PIX",
                        "Prazos com cronômetro de 24h",
                        "Mensagens prontas para WhatsApp",
                        "14 dias de teste grátis inclusos",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="size-4 text-primary shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button asChild variant="outline" size="lg" className="w-full font-semibold">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>
                      Testar Grátis (Até 100)
                    </Link>
                  </Button>
                </div>

                {/* Plano 2: De 100 até 300 clientes (DESTAQUE) */}
                <div className="relative rounded-3xl border-2 border-primary bg-gradient-to-b from-primary/10 via-card to-card p-7 space-y-6 flex flex-col justify-between shadow-2xl shadow-primary/10">
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1 font-bold text-xs shadow-md">
                      ⭐ Mais Escolhido por Lojas
                    </Badge>
                  </div>

                  <div className="space-y-4 pt-2">
                    <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">
                      Crescimento
                    </Badge>
                    <div>
                      <h3 className="text-xl font-bold">100 até 300 Clientes</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Para lojas com fluxo frequente de remessas e pré-vendas</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-primary">R$ 210</span>
                      <span className="text-xs text-muted-foreground">/ mês</span>
                    </div>

                    <ul className="space-y-2.5 text-xs text-foreground pt-2">
                      {[
                        "De 100 até 300 clientes vinculados",
                        "Lançamentos e pedidos ILIMITADOS",
                        "Controle financeiro de lucros e custos",
                        "Personalização de logotipo, cores e banner",
                        "Recuperação automática de vagas por falta de sinal",
                        "Suporte prioritário via WhatsApp",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-2 font-medium">
                          <Check className="size-4 text-primary shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button asChild size="lg" className="glow font-bold w-full bg-primary text-primary-foreground">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>
                      Criar Loja (100 a 300)
                    </Link>
                  </Button>
                </div>

                {/* Plano 3: De 300 a 700 clientes */}
                <div className="rounded-3xl border border-border/60 bg-card/60 p-7 space-y-6 flex flex-col justify-between hover:border-border transition-all">
                  <div className="space-y-4">
                    <Badge variant="outline" className="text-xs border-muted-foreground/40">
                      Escala Pro
                    </Badge>
                    <div>
                      <h3 className="text-xl font-bold">300 até 700 Clientes</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Para grandes estoques, importadores e distribuidores</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-foreground">R$ 280</span>
                      <span className="text-xs text-muted-foreground">/ mês</span>
                    </div>

                    <ul className="space-y-2.5 text-xs text-muted-foreground pt-2">
                      {[
                        "De 300 até 700 clientes cadastrados",
                        "Alto volume de reservas simultâneas",
                        "Relatórios completos de giro e faturamento",
                        "Links e vitrines personalizadas para grupos",
                        "Gestão avançada de clientes e histórico",
                        "Atendimento e suporte VIP",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="size-4 text-primary shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button asChild variant="outline" size="lg" className="w-full font-semibold">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>
                      Escolher Plano (300 a 700)
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>



          {/* FAQ Section */}
          <section className="border-t border-border/30 py-16">
            <div className="mx-auto max-w-3xl px-4">
              <div className="text-center max-w-2xl mx-auto mb-10">
                <Badge variant="outline" className="border-border text-muted-foreground mb-3">
                  <HelpCircle className="size-3 mr-1" /> Perguntas Frequentes
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Dúvidas sobre a plataforma?
                </h2>
                <p className="mt-3 text-muted-foreground text-sm">
                  Respostas rápidas para as perguntas mais comuns de lojistas e colecionadores.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    q: "Como funciona o Vendas 164?",
                    a: "O lojista cadastra o lançamento com foto, preço e unidades disponíveis. Depois compartilha o link com seus colecionadores. O cliente escolhe a quantidade, paga o sinal via PIX e garante a reserva. Quando o lote chegar, o lojista notifica o comprador para receber o saldo restante.",
                  },
                  {
                    q: "Preciso pagar para usar a plataforma?",
                    a: "Para colecionadores, a plataforma é 100% gratuita. Para lojistas, oferecemos 14 dias de teste grátis sem cartão. Os planos são baseados na quantidade de clientes: até 100 clientes (R$ 150/mês), de 100 a 300 clientes (R$ 210/mês) e de 300 a 700 clientes (R$ 280/mês).",
                  },
                  {
                    q: "Como o colecionador paga o sinal?",
                    a: "O pagamento do sinal é feito via PIX com código copia e cola diretamente na conta do lojista, sem intermediários ou taxas abusivas.",
                  },
                  {
                    q: "O que acontece se o cliente não pagar o sinal no prazo?",
                    a: "Se o comprador não confirmar o pagamento do sinal até a data/hora limite configurada pelo lojista (ex: 24h), o sistema libera a vaga automaticamente para outro colecionador.",
                  },
                  {
                    q: "Quais marcas de miniaturas posso cadastrar?",
                    a: "Qualquer marca! Mini GT, Kaido House, Hot Wheels, Inno64, Tarmac Works, Majorette, POPRACE, BM Creations, Era Car e muito mais.",
                  },
                ].map((faq, i) => (
                  <FaqItem key={i} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          </section>

          {/* CTA Final */}
          <section className="border-t border-border/30 bg-card/40 py-16 text-center">
            <div className="mx-auto max-w-4xl px-4 space-y-6">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Pronto para profissionalizar suas pré-vendas?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm">
                Cadastre seus lançamentos em menos de 2 minutos e comece seu período de 14 dias gratuitos agora mesmo.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button asChild size="lg" className="glow font-bold gap-2">
                  <Link to="/vendedor" search={{ tab: "produtos" }}>
                    Criar Minha Loja Grátis <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <AppFooter />
      </div>
    </ErrorBoundary>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
      >
        <span>{question}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border/20 px-5 py-4 text-sm text-muted-foreground leading-relaxed animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {answer}
        </div>
      )}
    </div>
  );
}
