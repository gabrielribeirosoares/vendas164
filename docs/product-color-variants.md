# Cores em um anúncio

No cadastro ou edição do produto, use **Opções de cor → Adicionar cor**. Cadastre o nome, estoque disponível e fotos de cada cor. Todas usam o preço e as condições do anúncio. O estoque geral passa a ser a soma das cores.

Na vitrine, **Escolher cor** abre o anúncio. A seleção troca as fotos e limita a quantidade ao estoque daquela cor. Cores diferentes ficam separadas no carrinho e nas reservas. A cor é preservada no pedido, nos detalhes, nas mensagens do vendedor e no romaneio.

A reserva manual também exige a cor. Cancelamento, exclusão e expiração devolvem a unidade à cor correta; reativação exige estoque disponível. Um retry de checkout não consome novamente o estoque. A fila continua por produto; reservas de cores expiradas não são atribuídas automaticamente a alguém sem escolha de cor.

Use estoque zero para retirar uma cor de venda. Uma cor que já aparece em pedidos não pode ser removida: o histórico e a devolução do estoque dependem dela. A edição detecta alterações concorrentes no estoque e solicita reabrir o produto.

## Ativação

Aplicar `supabase/migrations/20261008173147_product_color_variants.sql` depois das migrações anteriores, incluindo a correção de push e modalidade de venda. Publicar o frontend depois da migração. As definições finais de checkout, reserva manual e paginação do vendedor são preservadas nesta migração.

A migração adiciona `products.color_variants` e snapshots de cor em `orders`. Produtos sem cores continuam usando o fluxo anterior. Nenhum produto existente é convertido automaticamente.

## Validação

- `node --test tests/*.test.mjs`: checkout, estoque, rollback, idempotência, cancelamento, expiração, reservas manuais e compatibilidade de produtos comuns.
- `npx tsx scripts/test-product-variants-cart.ts`: cores separadas, fotos, preços e limites no carrinho.
- `npm run typecheck` e `npm run build`.

Os testes de banco usam PGlite. Antes de disponibilizar a clientes, conferir cadastro, fotos e compra de duas cores no ambiente com a migração aplicada.

## Cor, medida e freio

No cadastro, adicione uma linha para cada combinação disponível. Cor, medida e freio são opcionais; ao menos um deles deve ser preenchido. Cada linha tem estoque, fotos e preço próprio opcional. Sem preço próprio, a combinação usa as condições do produto. Com preço próprio, o valor vale à vista e parcelado, sem desconto por quantidade. O cliente escolhe as opções no mesmo anúncio; o pedido guarda o nome completo e a foto da combinação.

A migração `20261008203000_product_variant_options.sql` normaliza nomes e valida atributos/preços no servidor. O checkout lê o preço diretamente do banco. Os anúncios antigos de cor continuam compatíveis.

## Aba Rodinhas por loja

O administrador controla a liberação em **Moderação → Habilitar rodinhas** na linha de cada loja. Todas começam desabilitadas. A liberação mostra a aba no painel do vendedor (incluindo a navegação mobile) e na vitrine pública. As rodinhas são classificadas por `products.product_kind='rodinhas'`, independentemente da modalidade de pagamento/entrega, e ficam separadas do catálogo de miniaturas.

Para mover um anúncio existente, habilite a loja e edite **Seção da loja → Rodinhas**. Não há classificação automática dos anúncios atuais. Novos anúncios de miniaturas não exibem o editor de combinações; anúncios antigos com variantes preservam a edição para compatibilidade.

A migração `20261008203820_wheels_store_access.sql` protege a liberação administrativa, impede criação de rodinhas em lojas desabilitadas e bloqueia novas reservas após a desabilitação. Cancelamento e manutenção de pedidos existentes continuam possíveis. Produtos desabilitados ficam ocultos para o público; o lojista mantém acesso aos seus cadastros.
