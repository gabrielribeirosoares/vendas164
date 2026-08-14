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
  Car,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
          "dateModified": "2026-07-26T00:00:00-03:00"
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
                "text": "Para colecionadores, a plataforma é totalmente gratuita. Para lojistas, existe um plano de assinatura que libera todos os recursos de gestão de pré-vendas, estoque e financeiro."
              }
            },
            {
              "@type": "Question",
              "name": "Como o colecionador paga o sinal?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "O pagamento do sinal é feito via PIX com código copia e cola. O colecionador acessa o produto, copia a chave PIX e realiza o pagamento diretamente ao lojista."
              }
            },
            {
              "@type": "Question",
              "name": "O que acontece se eu não pagar o sinal no prazo?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Se o comprador não confirmar o pagamento do sinal até a data limite configurada pelo lojista, a vaga é liberada automaticamente para outro colecionador."
              }
            },
            {
              "@type": "Question",
              "name": "Quais marcas de miniaturas posso encontrar?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A plataforma é agnóstica quanto a fabricantes. As marcas mais comuns incluem Hot Wheels, Mini GT, Kaido House, Inno64, Tarmac Works, Majorette, POPRACE, BM Creations e Era Car."
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
                  <Sparkles className="size-3.5" /> Plataforma Exclusiva 1/64
                </Badge>
                
                <h1 className="text-4xl font-extrabold leading-[1.1] md:text-5xl tracking-tight">
                  Pré-vendas de miniaturas sem planilha, sem confusão.
                </h1>
                
                <p className="max-w-lg text-base md:text-lg text-muted-foreground leading-relaxed">
                  Cadastre unidades em pré-venda, defina o prazo do sinal, acompanhe o saldo a receber e permita que o colecionador acompanhe tudo e copie o PIX em 1 clique.
                </p>
                
                <div className="flex flex-wrap gap-3.5 pt-2">
                  <Button asChild size="lg" className="glow font-semibold gap-2">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>
                      <ShoppingBag className="size-4" /> Abrir minha loja
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="secondary" className="font-semibold gap-2">
                    <Link to="/painel">
                      <UserCheck className="size-4" /> Sou colecionador
                    </Link>
                  </Button>
                </div>

                <div className="pt-4 grid grid-cols-3 gap-3 border-t border-border/20 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    <span>Sem limite de peças</span>
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

          {/* Como Funciona em 3 Passos */}
          <section className="border-t border-border/30 bg-muted/20 py-16">
            <div className="mx-auto max-w-6xl px-4">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 mb-3">
                  Simples e Rápido
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Como funciona o Vendas 164
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Um fluxo desenhado sob medida para o mercado de miniaturas colecionáveis 1:64.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-3 relative">
                {[
                  {
                    step: "01",
                    title: "Cadastre o Lançamento",
                    desc: "Insira foto do modelo 1/64, fabricante, preço total, valor do sinal e o número de unidades disponíveis em pré-venda.",
                  },
                  {
                    step: "02",
                    title: "Compartilhe o Link",
                    desc: "Envie o catálogo ou o produto para seus colecionadores. O cliente escolhe a quantidade e garante a reserva pagando o sinal via PIX.",
                  },
                  {
                    step: "03",
                    title: "Acompanhe e Liquide",
                    desc: "Quando o lote chegar, notifique o comprador em 1 clique para receber o saldo restante e despachar o colecionável com segurança.",
                  },
                ].map((step, idx) => (
                  <div
                    key={step.step}
                    className="relative flex flex-col p-6 rounded-2xl border border-border/30 bg-card/60 backdrop-blur-sm"
                  >
                    <span className="text-4xl font-extrabold text-primary/40 mb-2">
                      {step.step}
                    </span>
                    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    {idx < 2 && (
                      <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 z-10 text-muted-foreground/30">
                        <ArrowRight className="size-6" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Seção de Vantagens Lojista vs Colecionador */}
          <section className="mx-auto max-w-6xl px-4 py-16">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Lojistas */}
              <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-card/80 to-primary/5 p-8 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <Car className="size-5" />
                  </div>
                  <h3 className="text-2xl font-bold">Para Lojistas e Vendedores</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Profissionalize suas pré-vendas de miniaturas Hot Wheels, Mini GT, Kaido House, Inno64, Tarmac e muito mais.
                </p>
                <ul className="space-y-3 text-sm">
                  {[
                    "Fim do controle manual por caderno ou planilhas confusas",
                    "Controle automático de desistências por falta de pagamento do sinal",
                    "Acompanhamento exato do saldo a receber quando a remessa chegar",
                    "Mensagens pré-formatadas para WhatsApp com 1 clique",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Button asChild className="glow w-full sm:w-auto">
                    <Link to="/vendedor" search={{ tab: "produtos" }}>Acessar Painel do Vendedor</Link>
                  </Button>
                </div>
              </div>

              {/* Colecionadores */}
              <div className="rounded-3xl border border-border/40 bg-card/60 p-8 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
                    <UserCheck className="size-5" />
                  </div>
                  <h3 className="text-2xl font-bold">Para Colecionadores</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tenha total transparência e garantia nas suas encomendas de peças raras em escala 1/64.
                </p>
                <ul className="space-y-3 text-sm">
                  {[
                    "Garanta miniaturas raras garantindo sua unidade pelo sinal",
                    "Acompanhe o cronômetro para envio de comprovantes de sinal",
                    "Chave PIX copia e cola para pagamentos instantâneos",
                    "Histórico completo das suas miniaturas encomendadas",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Button asChild variant="secondary" className="w-full sm:w-auto">
                    <Link to="/painel">Consultar Minhas Reservas</Link>
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
                <p className="mt-3 text-muted-foreground">
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
                    a: "Para colecionadores, a plataforma é totalmente gratuita. Para lojistas, existe um plano de assinatura que libera todos os recursos de gestão de pré-vendas, estoque e financeiro.",
                  },
                  {
                    q: "Como o colecionador paga o sinal?",
                    a: "O pagamento do sinal é feito via PIX com código copia e cola. O colecionador acessa o produto, copia a chave PIX e realiza o pagamento diretamente ao lojista.",
                  },
                  {
                    q: "O que acontece se eu não pagar o sinal no prazo?",
                    a: "Se o comprador não confirmar o pagamento do sinal até a data limite configurada pelo lojista, a vaga é liberada automaticamente para outro colecionador.",
                  },
                  {
                    q: "Quais marcas de miniaturas posso encontrar?",
                    a: "A plataforma é agnóstica quanto a fabricantes. As marcas mais comuns incluem Hot Wheels, Mini GT, Kaido House, Inno64, Tarmac Works, Majorette, POPRACE, BM Creations e Era Car.",
                  },
                ].map((faq, i) => (
                  <FaqItem key={i} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          </section>

          {/* CTA Final */}
          <section className="border-t border-border/30 bg-card/30 py-16 text-center">
            <div className="mx-auto max-w-4xl px-4 space-y-6">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Pronto para otimizar suas pré-vendas de miniaturas?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-base">
                Cadastre seus lançamentos em menos de 2 minutos e ofereça uma experiência de pré-venda impecável aos seus clientes.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-2">
                <Button asChild size="lg" className="glow font-semibold gap-2">
                  <Link to="/vendedor" search={{ tab: "produtos" }}>
                    Abrir minha loja de miniaturas <ArrowRight className="size-4" />
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
