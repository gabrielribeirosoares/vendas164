# Ajustes da branch testes

## Escopo

- Checkout do cliente em uma transação: valida estoque, preços, sinal, quantidade e parcelamento; grava pedidos e parcelas e devolve os mesmos IDs em uma repetição da requisição.
- Reserva manual do lojista também transacional, com verificação de propriedade da loja e proteção contra repetição durante a sessão do formulário.
- Parcelas calculadas em centavos, distribuindo o resto e limitando o vencimento ao último dia de cada mês.
- Leitura das parcelas restrita; criação financeira do cliente feita somente pela RPC. Função avulsa de estoque restrita ao dono da loja.
- Integração Bling autenticada por loja, segredos no servidor, tokens criptografados, estado OAuth de uso único e paginação do catálogo importado.
- Carrinho com quantidades, lojas e resumo de sinal/saldo; preços atualizáveis antes da confirmação.
- Carregamento incremental de reservas e fila do cliente. Filtros e paginação da vitrine no banco, sem baixar o catálogo completo.
- Cards de produto separados em componente, textos maiores e ações independentes dos links. Navegação lateral do vendedor e alertas acionáveis.
- Diálogo de reserva manual extraído do gerenciador de produtos.
- Correção do helper de rastreamento que recebia opções POST no parâmetro de headers. Token padrão do Melhor Envio movido para variável do servidor.

## Antes de disponibilizar

1. Revogar/rotacionar no Bling os client secrets e refresh tokens anteriormente versionados. Remover do código não invalida as credenciais presentes no histórico Git. Rotacionar também o token do Melhor Envio anteriormente versionado. Não reescrever o histórico publicado: este repositório sincroniza com o Lovable.
2. Aplicar as quatro novas migrações, em ordem, em uma base de homologação que corresponda ao schema da aplicação. Fazer backup e verificar as políticas efetivas antes de aplicar em produção. Os testes locais usam o schema versionado, não inspecionam o banco remoto.
3. Publicar o frontend e as migrações na mesma janela de manutenção. A migração de segurança desativa `create_reservation` para clientes; versões antigas do frontend não conseguem concluir reservas após ela. A versão nova depende de `checkout_cart`, `catalog_page` e `create_manual_reservations`.
4. Configurar somente no servidor:
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (já utilizados pela infraestrutura de autenticação).
   - `BLING_STORE_CREDENTIALS`: JSON indexado pelo UUID exato da loja: `{"<store_uuid>":{"clientId":"<novo_client_id>","clientSecret":"<novo_client_secret>"}}`.
   - `BLING_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios em base64. Gerar por um gerenciador de segredos ou `openssl rand -base64 32`. Manter backup seguro; trocar esta chave exige reautorizar as conexões existentes.
   - `MELHOR_ENVIO_TOKEN`, se houver integração de rastreamento por esse provedor.
   Nenhuma dessas credenciais deve usar prefixo `VITE_`, entrar no Git ou ser enviada em chat.
5. O proprietário acessa o importador Bling, prepara a autorização, abre o link e retorna o URL completo com `code` e `state`. Tokens antigos do navegador são descartados, não reutilizados.
6. Validar com duas contas e duas lojas na homologação: carrinho misto, preço alterado, saldo/parcelas, estoque disputado, reserva manual, autorização Bling, renovação de token e rastreamento.

## Verificação local

Use Node 24 e npm (`package-lock.json` é o lockfile utilizado na CI):

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

Os testes executam SQL real no PostgreSQL embarcado PGlite. Cobrem rollback, idempotência, permissões, preço, parcelas, estoque, reserva manual e paginação. O teste da última unidade usa requisições sucessivas; homologar concorrência entre sessões PostgreSQL reais antes de produção.

O navegador remoto não conseguiu acessar o servidor local; a aparência em desktop/celular e os fluxos autenticados ainda precisam de validação visual em homologação. Nenhuma migração foi aplicada ao banco remoto e nenhuma credencial foi rotacionada automaticamente.

## Limites e evolução

- Os estados financeiros antigos foram preservados para compatibilidade. Novas reservas incluem snapshots `sale_type`, `payment_terms` e `signal_amount`; a migração completa dos estados e dos pedidos antigos fica para uma alteração de dados separada.
- O painel do vendedor ainda usa coleções completas para clientes, relatórios e indicadores. Paginar essas consultas exige mover também os agregados financeiros para o servidor; paginar apenas a listagem produziria totais incorretos.
- Os gerenciadores de clientes e pedidos ainda podem ser divididos em componentes menores. Esta alteração extrai o formulário manual e o card público, sem reescrever todos os módulos.
- A confirmação de pagamento continua sendo operacional; não foi adicionada conciliação bancária automática.
- A RPC de expiração e as rotinas antigas de cancelamento não foram redesenhadas nesta alteração. Devem passar por uma revisão própria de concorrência e auditoria.
