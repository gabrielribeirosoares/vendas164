# Operações do vendedor e notificações

A migração `20261013135108_atomic_seller_operations_and_financial_totals.sql` restringe assinaturas push ao próprio usuário, cria `seller_mutate_orders` e corrige os totais de pedidos e clientes. As alterações de estoque, status, parcelas e exclusão são feitas numa única transação. Cancelamentos repetidos não devolvem estoque novamente; reativação sem estoque falha sem alterar o lote. Variações continuam usando seu gatilho de estoque. Parcelas pagas são preservadas ao cancelar; pendentes são removidas.

O frontend envia uma operação por seleção, limitada a 1.000 unidades, e só mostra sucesso após o retorno do banco. Os resumos reconhecem `quitado` pelo valor total, sem exigir parcelas pagas como evidência adicional. Nenhum valor, pagamento ou estoque existente é reescrito pela migração.

Notificações recebem o ID do pedido, exigem sessão e conferem a relação com a reserva. O banco resolve destinatário/status e registra um claim para limitar repetição do mesmo aviso por pedido/status. Novo pedido só pode ser notificado pelo seu cliente até 15 minutos após a criação; atualização só pelo responsável autorizado pela loja. O cadastro da assinatura passa pelo cliente autenticado e pelas políticas RLS, impedindo sobrescrita de assinatura pertencente a outra conta.

O claim impede replay do mesmo aviso; uma falha após o claim pode deixar o aviso sem envio. Entrega e leitura em dispositivos reais não estão comprovadas por testes locais. Lembretes de vencimento e e-mail permanecem desativados: sua ativação exige o fluxo descrito em `signal-expiry-reminders.md`.

Validação: testes transacionais no PGlite cobrem lotes, estoque insuficiente, exclusão/cancelamento repetidos, preservação de parcelas pagas, variantes, autorização e claims de push, isolamento de assinaturas e totais de quitação.
