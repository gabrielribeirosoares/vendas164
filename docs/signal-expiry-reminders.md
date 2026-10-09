# Lembretes de sinal

A interface destaca reservas aguardando sinal que vencem nas próximas 24 horas. Clientes com notificações autorizadas recebem um push discreto, sem valor, produto ou identificação do cliente. Reservas criadas com prazo menor que 24 horas entram na próxima execução; não prometemos envio exatamente 24 horas antes.

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

O topo mobile mantém os ícones de tema e notificações; o hambúrguer reúne a navegação. A desativação remove apenas a inscrição da conta autenticada neste dispositivo. Não alteramos variáveis, chaves, migrações remotas ou agendamento nesta entrega. Validar em 320, 375, 390 e 430 px, incluindo PWA iOS: menu, seção ativa, rodinhas autorizadas, card fechado e detalhes. Testar duas contas no mesmo dispositivo e sinal pago/cancelado antes do envio.

Aplicar também `20261009182842_signal_expiry_priority.sql`, após as migrações de variantes, para ordenar os sinais pelo prazo mais próximo antes da paginação. A migração está preparada no repositório e não foi aplicada remotamente.

Validação desta entrega: 129 testes Node/PGlite, 48 casos do parser CSV, TypeScript e build aprovados. A validação visual em navegador não foi concluída: o download do Chromium neste ambiente retornou um arquivo inválido. Validar menu e cards no preview autenticado antes de promover para main. A disponibilidade de cron, políticas efetivas, chaves e entregas em dispositivos reais não foi verificada remotamente.
