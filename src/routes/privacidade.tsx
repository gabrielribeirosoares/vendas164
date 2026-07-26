import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ShieldCheck, Lock, UserCheck, Eye, Database, FileCheck, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacidade")({
  component: PoliticaDePrivacidade,
});

function PoliticaDePrivacidade() {
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
          <span className="text-xs text-muted-foreground">LGPD · Lei nº 13.709/2018</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-10 space-y-8 shadow-sm">
          <div className="space-y-3 border-b border-border/60 pb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
              <ShieldCheck className="size-3.5" /> em Conformidade com a LGPD
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Política de Privacidade e Proteção de Dados</h1>
            <p className="text-sm text-muted-foreground">
              Esta Política descreve como a plataforma Vendas 164 coleta, utiliza, armazena e protege seus dados pessoais em total conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
            </p>
          </div>

          {/* SEÇÕES DA POLÍTICA DE PRIVACIDADE / LGPD */}
          <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-500 shrink-0" /> 1. Compromisso com a Privacidade
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                A sua privacidade e a segurança das suas informações são prioridades fundamentais para o Vendas 164. Garantimos transparência na gestão de dados e adotamos medidas técnicas e administrativas avançadas para proteger seus dados pessoais contra acessos não autorizados ou vazamentos.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Database className="size-4 text-emerald-500 shrink-0" /> 2. Dados Pessoais Coletados
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Coletamos apenas os dados estritamente necessários para a prestação dos nossos serviços de gestão de reservas:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li><strong>Dados de Cadastro:</strong> Nome completo, endereço de e-mail e número de telefone/WhatsApp.</li>
                <li><strong>Dados de Reservas:</strong> Histórico de pré-vendas reservadas, valores de sinal/saldo e código de rastreamento de entregas.</li>
                <li><strong>Dados de Lojistas:</strong> Nome da loja, logotipo, chave PIX informada e configurações de personalização.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Eye className="size-4 text-emerald-500 shrink-0" /> 3. Finalidade do Tratamento de Dados
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li>Permitir o gerenciamento e acompanhamento de reservas de miniaturas em tempo real.</li>
                <li>Possibilitar a comunicação entre o lojista e o colecionador para envio de comprovantes e atualizações de entrega.</li>
                <li>Garantir a segurança da conta e autenticação dos usuários.</li>
                <li>Cumprir obrigações legais e regulatórias pertinentes.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <UserCheck className="size-4 text-emerald-500 shrink-0" /> 4. Direitos do Titular dos Dados (Art. 18 da LGPD)
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Como titular dos dados pessoais, você possui os seguintes direitos garantidos por lei:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-xs sm:text-sm">
                <li><strong>Confirmação e Acesso:</strong> Confirmar a existência de tratamento e acessar seus dados.</li>
                <li><strong>Correção:</strong> Solicitar a correção de dados incompletos, inexatos ou desatualizados.</li>
                <li><strong>Eliminação:</strong> Requerer a exclusão de seus dados pessoais tratados com o seu consentimento.</li>
                <li><strong>Portabilidade:</strong> Solicitar a transferência dos seus dados a outro fornecedor de serviço.</li>
                <li><strong>Revogação do Consentimento:</strong> Revogar o consentimento para o tratamento de dados a qualquer momento.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Lock className="size-4 text-emerald-500 shrink-0" /> 5. Segurança e Compartilhamento de Dados
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                <strong>Não vendemos, alugamos ou comercializamos seus dados pessoais com terceiros em nenhuma hipótese.</strong> Seus dados são compartilhados apenas com a loja na qual você efetuou uma reserva específica para que o atendimento e entrega da sua miniatura possam ser concluídos.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileCheck className="size-4 text-emerald-500 shrink-0" /> 6. Armazenamento e Criptografia
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Utilizamos infraestrutura de dados moderna com criptografia ponta a ponta (SSL/TLS) e controle de acesso via Row Level Security (RLS) no Supabase, garantindo que cada usuário acesse exclusivamente as informações autorizadas.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Mail className="size-4 text-emerald-500 shrink-0" /> 7. Canal de Atendimento LGPD / Encarregado (DPO)
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Para exercer seus direitos de titular de dados ou esclarecer dúvidas sobre esta Política de Privacidade, você pode entrar em contato com o nosso Encarregado de Proteção de Dados (DPO) através dos nossos canais oficiais de suporte na plataforma.
              </p>
            </section>
          </div>

          <div className="border-t border-border/60 pt-6 flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/termos"
              className="text-xs sm:text-sm font-medium text-primary hover:underline"
            >
              Consulte também nossos Termos e Condições de Uso →
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
