# Lembretes de sinal

A interface destaca reservas aguardando sinal que vencem nas próximas 24 horas. Após ativação, clientes com notificações autorizadas poderão receber um push discreto, sem valor, produto ou identificação do cliente. Reservas criadas com prazo menor que 24 horas entram na próxima execução; não prometemos envio exatamente 24 horas antes.

## Ativação após validar testes

1. Aplicar `supabase/migrations/20261004015928_signal_expiry_reminders.sql`. Ela cria o registro de entregas, índice e função de claim, e amplia o filtro do vendedor. Não altera reservas existentes, estoque ou valores.
2. Publicar a branch aprovada em produção.
3. Conferir `VITE_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` na Vercel. Devem ser o mesmo par usado pelos dispositivos já inscritos; o novo lembrete não usa chaves de fallback.
4. Criar uma chave aleatória de pelo menos 32 caracteres como `SIGNAL_REMINDER_CRON_SECRET`, somente no servidor. Configurar `SIGNAL_REMINDERS_ENABLED=true` em produção. Prévia deve continuar desabilitada para não avisar clientes reais durante testes.
5. Salvar o mesmo segredo no Supabase Vault com nome `signal_reminder_cron_secret` e executar `supabase/scripts/enable_signal_reminder_schedule.sql`. Ele ativa pg_cron e pg_net e agenda a chamada a cada 15 minutos. O cron da Vercel não é usado: seu plano Hobby limita a execução a uma vez por dia.
6. Conferir o job no painel Cron, as respostas em `net._http_response` e os totais de entrega; não divulgar URLs de assinaturas nem seus tokens.

## Comportamento

- Consulta só reservas aguardando sinal, não canceladas, prazo futuro até 24h e valor de sinal positivo.
- Só envia a dispositivos inscritos do cliente da reserva, com prazo revalidado antes do envio.
- Claim atômico por reserva, prazo e dispositivo impede execuções concorrentes duplicadas. Mudança de prazo permite novo lembrete.
- No máximo 20 dispositivos por execução, cinco em paralelo. Falhas transitórias têm até três tentativas; leases abandonadas são recuperadas após 10 minutos.
- Sucesso é a aceitação pelo serviço push, não confirmação de leitura. Rede, permissões e sistema operacional podem atrasar ou impedir a entrega. Uma notificação já aceita pode aparecer após pagamento; a revalidação evita iniciar novos envios para reservas já pagas.
- Em falha entre envio e gravação do resultado, a repetição é possível; o service worker usa uma tag estável para substituir o aviso anterior no dispositivo.
- Assinaturas expiradas (404/410) são removidas. O clique abre `/painel`, que exige autenticação.
- Não dispara WhatsApp nem envia notificações ao lojista automaticamente. O lojista tem o alerta acionável no painel.
- A migração e o agendamento não são aplicados automaticamente pelo deploy GitHub/Vercel.

## Homologação mobile

O topo mobile mantém os ícones de tema e notificações. A desativação remove apenas a inscrição da conta autenticada neste dispositivo. Não alteramos variáveis, chaves, migrações remotas ou agendamento nesta entrega. Validar em 320, 375, 390 e 430 px, incluindo PWA iOS: menu, seção ativa, rodinhas autorizadas, card fechado e detalhes. Testar duas contas no mesmo dispositivo e sinal pago/cancelado antes do envio.

Aplicar também `20261009182842_signal_expiry_priority.sql`, após as migrações de variantes, para ordenar os sinais pelo prazo mais próximo antes da paginação. A migração está preparada no repositório e não foi aplicada remotamente.

Validação desta entrega: 129 testes Node/PGlite, 48 casos do parser CSV, TypeScript e build aprovados. A validação visual em navegador não foi concluída: o download do Chromium neste ambiente retornou um arquivo inválido. Validar menu e cards no preview autenticado antes de promover para main. A disponibilidade de cron, políticas efetivas, chaves e entregas em dispositivos reais não foi verificada remotamente.


## Alternativa por e-mail — preparação de 09/10/2026

Esta entrega prepara consentimento e envio por Resend. Não cria conta no provedor, não altera DNS/variáveis remotas, não aplica migração e não envia mensagens.

- O sino abre as opções em um popover compacto, inclusive quando o navegador não suporta push. Android/computador podem usar push sem instalar o PWA; iPhone/iPad sem suporte recebem instruções para instalar na Tela de Início.
- E-mail é uma escolha explícita para lembretes de sinal, em vez do push desses lembretes. Não altera avisos de atualização de pedido. Não existe opt-in automático nem destinatário livre digitado pelo vendedor.
- O servidor obtém o endereço confirmado em Auth. Ao trocar o endereço da conta, é necessário autorizar novamente. Antes de enviar, revalida e-mail confirmado, consentimento, dono da reserva, sinal positivo e prazo/status.
- A preferência é da conta, em todas as lojas. Desativação no sino interrompe novos envios. E-mails já aceitos pelo provedor não podem ser recolhidos.
- Claims de ambos os canais excluem envios aceitos pelo outro canal para a mesma reserva/prazo. Leases recentes bloqueiam o outro canal; abandonadas podem ser recuperadas após 10 minutos. Uma troca de preferência durante um envio tem uma janela residual de concorrência; não prometemos exatamente uma entrega.
- Resend usa chave de idempotência estável por reserva/prazo (validade no provedor: 24 horas). E-mail em texto simples sem valor/nome/produto, com link fixo para o painel autenticado e instrução de desativação. Aceitação pelo provedor não confirma recebimento/leitura.
- Máximo de cinco e-mails sequenciais por chamada, timeout de cinco segundos por pedido ao provedor; erro 429/5xx é recuperável, outros erros HTTP encerram aquele lembrete. O lote restante fica com lease recuperável.

### Ativação somente após aprovação

1. Aplicar primeiro a migração de push `20261004015928_signal_expiry_reminders.sql`, depois `20261009194010_signal_email_reminders.sql`. A segunda cria preferências/entregas de e-mail e substitui o claim de push para receber `_user_id` opcional. Coordenar a migração com o deploy, mantendo os envios desligados durante a transição.
2. Configurar conta Resend e domínio remetente verificado, com DNS exigido pelo provedor. Escolher remetente em `SIGNAL_REMINDER_EMAIL_FROM` e chave restrita a envio em `RESEND_API_KEY` (ambos somente servidor). Custos/limites do provedor precisam ser avaliados antes de contratar.
3. Configurar `SIGNAL_EMAIL_PREFERENCES_ENABLED=true` somente quando migração e provedor estiverem prontos; antes disso a interface informa indisponibilidade. `SIGNAL_EMAIL_REMINDERS_ENABLED=true` habilita o canal, também condicionado à flag de preferências. `SIGNAL_REMINDERS_ENABLED` continua sendo a trava global, desativada por padrão. O job atual exige também as chaves VAPID para o canal push.
4. Para homologação fora de produção, o código exige `SIGNAL_REMINDER_TEST_USER_ID` com UUID de uma única conta aprovada; os dois claims filtram essa conta antes de registrar ou enviar. Não há destino alternativo para sobrescrever dados de outro cliente. Preparar reserva fictícia e obter autorização específica de envio para a conta/dispositivo/e-mail indicado.
5. Validar pagamento/cancelamento antes do envio, opt-out, conta sem e-mail confirmado, endereço alterado, conta sem push, falha do provedor e múltiplas chamadas. Só então ativar o agendamento aprovado de produção. Até esse momento, nenhum cron/flag remoto será alterado.

Validação local: regras e permissões exercitadas em PGlite; envio exercitado com Auth/DB/Resend simulados, sem rede real. A conferência visual e a entrega em dispositivo/caixa de e-mail reais permanecem pendentes.
