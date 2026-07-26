import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ShieldCheck, FileText, ArrowLeft, Lock, Scale, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/termos")({
  component: TermosDeUso,
});

function TermosDeUso() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader />

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" /> Voltar ao início
          </Link>
          <span className="text-xs text-muted-foreground">Última atualização: 26 de Julho de 2026</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-10 space-y-8 shadow-sm">
          <div className="space-y-3 border-b border-border/60 pb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
              <FileText className="size-3.5" /> Documento Jurídico
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Termos e Condições de Uso</h1>
            <p className="text-sm text-muted-foreground">
              Estes Termos de Uso regem o acesso e a utilização da plataforma Vendas 164 por lojistas, vendedores e compradores de miniaturas colecionáveis.
            </p>
          </div>

          {/* SEÇÕES DOS TERMOS DE USO */}
          <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Scale className="size-4 text-primary shrink-0" /> 1. Aceitação dos Termos
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Ao acessar ou utilizar a plataforma Vendas 164, você declara que leu, compreendeu e concorda expressamente com estes Termos de Uso e com a nossa Política de Privacidade (LGPD). Caso não concorde com qualquer disposição aqui prevista, solicitamos que não utilize os serviços.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary shrink-0" /> 2. Descrição do Serviço
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                O Vendas 164 é uma plataforma de software como serviço (SaaS) destinada à organização, gestão e acompanhamento de reservas, pré-vendas, estoques e envios de miniaturas colecionáveis (escala 1/64 e correlatas) entre lojistas independentes e seus respectivos clientes.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Lock className="size-4 text-primary shrink-0" /> 3. Cadastro e Responsabilidades da Conta
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li>O usuário é responsável por manter a confidencialidade das credenciais de acesso à sua conta.</li>
                <li>As informações fornecidas no cadastro devem ser precisas, completas e atualizadas.</li>
                <li>Cada usuário responde integralmente pelos atos praticados através de sua conta na plataforma.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary shrink-0" /> 4. Regras para Lojistas e Vendedores
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li>O lojista deve fornecer informações transparentes sobre o valor total do produto, o valor do sinal de reserva, os prazos estimados de lançamento e envio.</li>
                <li>O lojista é o único responsável pela custódia do produto, emissão de comprovantes, cumprimento dos prazos e envio dos códigos de rastreamento válidos aos clientes.</li>
                <li>É vedado o cadastro de itens ilícitos ou em desacordo com a legislação brasileira vigente.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary shrink-0" /> 5. Regras para Compradores e Colecionadores
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li>Ao efetuar uma reserva ou pré-venda, o comprador compromete-se a respeitar as condições e prazos estipulados pela loja para o pagamento do sinal e do saldo final.</li>
                <li>O pagamento e a liquidação das reservas ocorrem diretamente entre o comprador e o lojista cadastrado na plataforma.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Scale className="size-4 text-primary shrink-0" /> 6. Propriedade Intelectual e Limitação de Responsabilidade
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Todas as marcas, marcas registradas e nomes de produtos mencionados (como Hot Wheels, Mini GT, Kaido House, Inno64, etc.) pertencem aos seus respectivos proprietários e são utilizados nesta plataforma exclusivamente para fins de identificação e catalogação de miniaturas colecionáveis. O Vendas 164 atua como provedor de tecnologia de intermediação de gestão de reservas e não responde por divergências comerciais diretas entre lojista e comprador.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <HelpCircle className="size-4 text-primary shrink-0" /> 7. Alterações nos Termos e Contato
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Estes Termos podem ser atualizados periodicamente para refletir melhorias no serviço ou adequações legais. O uso continuado da plataforma após alterações constitui aceitação dos novos termos. Para dúvidas juridicas ou suporte, entre em contato através dos nossos canais de atendimento.
              </p>
            </section>
          </div>

          <div className="border-t border-border/60 pt-6 flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/privacidade"
              className="text-xs sm:text-sm font-medium text-primary hover:underline"
            >
              Conheça também a nossa Política de Privacidade (LGPD) →
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link to="/">Voltar à Plataforma</Link>
            </Button>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
