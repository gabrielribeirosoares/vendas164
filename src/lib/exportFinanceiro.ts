export interface PedidoBruto {
  id: string;
  created_at: string;
  payment_status: string;
  delivery_status: string;
  total_price: number;
  down_payment?: number | null;
  remaining_balance?: number | null;
  profiles?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  products?: {
    model?: string | null;
    brand?: string | null;
    price?: number | null;
  } | null;
}

export interface LinhaExportacaoFinanceira {
  idPedido: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  produtoModelo: string;
  produtoMarca: string;
  competenciaReserva: string;
  statusPagamento: string;
  statusEntrega: string;
  valorTotal: number;
  valorSinalRecebido: number;
  saldoProvisionado: number;
}

export function prepararDadosExportacaoFinanceira(
  pedidos: PedidoBruto[]
): LinhaExportacaoFinanceira[] {
  return pedidos.map((pedido) => {
    const total = Number(pedido.total_price || 0);
    const sinal = Number(pedido.down_payment || 0);

    let valorSinalRecebido = 0;
    let saldoProvisionado = 0;

    if (pedido.payment_status === "quitado") {
      valorSinalRecebido = total;
      saldoProvisionado = 0;
    } else if (pedido.payment_status === "sinal_pago") {
      valorSinalRecebido = sinal;
      saldoProvisionado = Math.max(0, total - sinal);
    } else if (pedido.payment_status === "cancelado") {
      valorSinalRecebido = 0;
      saldoProvisionado = 0;
    } else {
      valorSinalRecebido = 0;
      saldoProvisionado = total;
    }

    const dataCompetencia = pedido.created_at
      ? pedido.created_at.split("T")[0]
      : "";

    return {
      idPedido: pedido.id,
      clienteNome: pedido.profiles?.name || "Cliente",
      clienteEmail: pedido.profiles?.email || "",
      clienteTelefone: pedido.profiles?.phone || "",
      produtoModelo: pedido.products?.model || "",
      produtoMarca: pedido.products?.brand || "",
      competenciaReserva: dataCompetencia,
      statusPagamento: pedido.payment_status,
      statusEntrega: pedido.delivery_status,
      valorTotal: total,
      valorSinalRecebido,
      saldoProvisionado,
    };
  });
}
