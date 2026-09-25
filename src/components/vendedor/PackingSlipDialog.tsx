import { useState, useMemo } from 'react';
import {
  Printer,
  Package,
  CheckCircle2,
  Truck,
  Search,
  Download,
  CheckSquare,
  Square,
  Phone,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { brl, whatsappLink } from '@/lib/format';
import { toast } from 'sonner';

export interface PackingSlipItem {
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  productName: string;
  productBrand: string;
  productScale?: string | null;
  quantity: number;
  paymentStatus: string;
  deliveryStatus: string;
  remainingBalance: number;
  trackingCode?: string | null;
  createdAt: string;
}

export interface PackingSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: PackingSlipItem[];
  storeName?: string;
}

export function PackingSlipDialog({
  open,
  onOpenChange,
  orders,
  storeName = 'Minha Loja',
}: PackingSlipDialogProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('todos');
  const [filterPayment, setFilterPayment] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Lista única de produtos disponíveis para filtragem rápida por lote
  const productOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    orders.forEach((o) => {
      const key = `${o.productBrand} ${o.productName}`.trim();
      const existing = map.get(key) || { label: key, count: 0 };
      existing.count += o.quantity;
      map.set(key, existing);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [orders]);

  // Itens filtrados para o romaneio
  const filteredOrders = useMemo(() => {
    return orders.filter((item) => {
      // Filtro de produto
      if (selectedProduct !== 'todos') {
        const fullProd = `${item.productBrand} ${item.productName}`.trim();
        if (fullProd !== selectedProduct) return false;
      }

      // Filtro de pagamento
      if (filterPayment === 'quitado' && item.paymentStatus !== 'quitado') {
        return false;
      }
      if (filterPayment === 'pendente' && item.paymentStatus === 'quitado') {
        return false;
      }

      // Busca por texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.customerName.toLowerCase().includes(q);
        const matchPhone = (item.customerPhone || '').includes(q);
        const matchProd = `${item.productBrand} ${item.productName}`.toLowerCase().includes(q);
        const matchTracking = (item.trackingCode || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchProd && !matchTracking) return false;
      }

      return true;
    });
  }, [orders, selectedProduct, filterPayment, searchQuery]);

  // Estatísticas do Romaneio
  const stats = useMemo(() => {
    const totalUnits = filteredOrders.reduce((sum, o) => sum + o.quantity, 0);
    const uniqueCustomers = new Set(filteredOrders.map((o) => o.customerName.toLowerCase())).size;
    const checkedCount = filteredOrders.filter((o) => checkedItems.has(o.orderId)).length;
    const allQuitados = filteredOrders.every((o) => o.paymentStatus === 'quitado');
    return { totalUnits, uniqueCustomers, checkedCount, allQuitados };
  }, [filteredOrders, checkedItems]);

  const toggleCheck = (orderId: string) => {
    const next = new Set(checkedItems);
    if (next.has(orderId)) {
      next.delete(orderId);
    } else {
      next.add(orderId);
    }
    setCheckedItems(next);
  };

  const toggleCheckAll = () => {
    if (checkedItems.size === filteredOrders.length) {
      setCheckedItems(new Set());
    } else {
      setCheckedItems(new Set(filteredOrders.map((o) => o.orderId)));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (filteredOrders.length === 0) return toast.error('Nenhum item para exportar.');

    const headers = [
      'Conferido',
      'Cliente',
      'WhatsApp',
      'Marca',
      'Miniatura',
      'Escala',
      'Quantidade',
      'Status Pagamento',
      'Saldo Restante',
      'Codigo Rastreio',
    ];

    const rows = filteredOrders.map((o) => [
      checkedItems.has(o.orderId) ? 'SIM' : 'NAO',
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.customerPhone || ''}"`,
      `"${o.productBrand.replace(/"/g, '""')}"`,
      `"${o.productName.replace(/"/g, '""')}"`,
      `"${o.productScale || '1:64'}"`,
      o.quantity,
      `"${o.paymentStatus}"`,
      o.remainingBalance.toFixed(2),
      `"${o.trackingCode || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `romaneio_separacao_${storeName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Romaneio exportado para CSV com sucesso!');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 max-h-[92vh] flex flex-col gap-0 overflow-hidden bg-background">
        {/* CABEÇALHO (Oculto na impressão regular e substituído por cabeçalho formal) */}
        <div className="p-4 sm:p-5 pr-12 sm:pr-16 border-b border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Truck className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Romaneio de Separação de Lotes
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Conferência, embalagem e despacho de encomendas da loja{' '}
                  <strong className="text-foreground">{storeName}</strong>
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleExportCsv}
            >
              <Download className="size-3.5 text-primary" />
              Exportar CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Imprimir Romaneio
            </Button>
          </div>
        </div>

        {/* ÁREA IMPRIMÍVEL DO CABEÇALHO (Aparece no @media print) */}
        <div className="hidden print:block p-6 border-b border-black text-black">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-wider">{storeName}</h1>
              <p className="text-sm font-semibold mt-0.5">ROMANEIO DE SEPARAÇÃO E EXPEDIÇÃO DE ENCOMENDAS</p>
            </div>
            <div className="text-right text-xs">
              <p>Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
              <p>Hora: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-gray-400 text-xs flex gap-6">
            <span><strong>Total de Unidades:</strong> {stats.totalUnits}</span>
            <span><strong>Destinatários Únicos:</strong> {stats.uniqueCustomers}</span>
            {selectedProduct !== 'todos' && (
              <span><strong>Lote Específico:</strong> {selectedProduct}</span>
            )}
          </div>
        </div>

        {/* FILTROS E SUMÁRIO (Não aparecem na impressão) */}
        <div className="p-4 border-b border-border/40 bg-card space-y-3 no-print">
          {/* BARRA DE FILTROS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Filtro de Lote / Miniatura */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Filtrar por Lote / Miniatura:
              </label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todas as miniaturas" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="todos">Todos os modelos ({orders.length} pedidos)</SelectItem>
                  {productOptions.map(([key, data]) => (
                    <SelectItem key={key} value={key}>
                      {key} ({data.count} un.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Pagamento */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Situação Financeira:
              </label>
              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos os pagamentos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="quitado">Apenas Quitado (100% Pago)</SelectItem>
                  <SelectItem value="pendente">Com Saldo Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Busca textual */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Buscar Destinatário / Rastreio:
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Nome, celular ou rastreio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* INDICADORES EM MINIATURA */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-foreground">
                Pacotes: <strong className="text-primary">{filteredOrders.length}</strong>
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Miniaturas: <strong className="text-foreground">{stats.totalUnits} un.</strong>
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Clientes: <strong className="text-foreground">{stats.uniqueCustomers}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={toggleCheckAll}
              >
                {checkedItems.size === filteredOrders.length && filteredOrders.length > 0 ? (
                  <>
                    <CheckSquare className="size-3.5 text-primary" /> Desmarcar todos
                  </>
                ) : (
                  <>
                    <Square className="size-3.5" /> Marcar todos como conferidos
                  </>
                )}
              </Button>
              <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
                Conferidos: {stats.checkedCount} / {filteredOrders.length}
              </Badge>
            </div>
          </div>
        </div>

        {/* LISTAGEM / TABELA DE CONFERÊNCIA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 print:p-0">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Package className="size-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum pedido encontrado com os filtros selecionados.</p>
              <p className="text-xs mt-1">Experimente alterar os filtros de produto ou pagamento.</p>
            </div>
          ) : (
            <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm print:border-black print:rounded-none">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border/80 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider print:bg-gray-100 print:text-black print:border-black">
                    <th className="p-3 w-10 text-center">Conf.</th>
                    <th className="p-3">Destinatário / Contato</th>
                    <th className="p-3">Miniatura / Lote</th>
                    <th className="p-3 text-center w-14">Qtd</th>
                    <th className="p-3">Financeiro</th>
                    <th className="p-3">Rastreio / Envio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 print:divide-black">
                  {filteredOrders.map((item, idx) => {
                    const isChecked = checkedItems.has(item.orderId);
                    const isQuitado = item.paymentStatus === 'quitado';

                    return (
                      <tr
                        key={item.orderId}
                        className={`transition-colors hover:bg-muted/30 ${
                          isChecked ? 'bg-primary/5 print:bg-gray-50' : ''
                        }`}
                      >
                        {/* CHECKBOX DE CONFERÊNCIA */}
                        <td className="p-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => toggleCheck(item.orderId)}
                            className="inline-flex items-center justify-center size-5 rounded border border-border/80 hover:border-primary focus:outline-none print:border-black print:size-4"
                            title="Marcar como embalado/conferido"
                          >
                            {isChecked ? (
                              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 print:text-black" />
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-mono print:hidden">
                                {idx + 1}
                              </span>
                            )}
                          </button>
                        </td>

                        {/* CLIENTE */}
                        <td className="p-3 align-middle font-medium text-foreground">
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-foreground print:text-black">
                              {item.customerName}
                            </span>
                            {item.customerPhone ? (
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground print:text-black">
                                <Phone className="size-3 text-emerald-600 print:hidden" />
                                <span>{item.customerPhone}</span>
                                <a
                                  href={whatsappLink(
                                    item.customerPhone,
                                    `Olá ${item.customerName}! Sua miniatura ${item.productBrand} ${item.productName} está sendo separada para envio pela loja ${storeName}.`,
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 dark:text-emerald-400 hover:underline print:hidden ml-1"
                                  title="Avisar cliente no WhatsApp"
                                >
                                  WhatsApp
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic print:hidden">
                                Sem telefone
                              </span>
                            )}
                          </div>
                        </td>

                        {/* PRODUTO */}
                        <td className="p-3 align-middle">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground print:text-black">
                              {item.productBrand} {item.productName}
                            </span>
                            <span className="text-[10px] text-muted-foreground print:text-gray-600">
                              Escala: {item.productScale || '1:64'}
                            </span>
                          </div>
                        </td>

                        {/* QUANTIDADE */}
                        <td className="p-3 text-center align-middle font-bold text-sm text-foreground print:text-black">
                          {item.quantity}x
                        </td>

                        {/* FINANCEIRO */}
                        <td className="p-3 align-middle">
                          {isQuitado ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold text-[10px] print:border-black print:text-black print:bg-transparent"
                            >
                              ✓ 100% Pago
                            </Badge>
                          ) : (
                            <div className="flex flex-col">
                              <Badge
                                variant="outline"
                                className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold text-[10px] w-fit print:border-black print:text-black print:bg-transparent"
                              >
                                Pendente: {brl(item.remainingBalance)}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground mt-0.5 print:text-black">
                                Cobrar antes do envio
                              </span>
                            </div>
                          )}
                        </td>

                        {/* RASTREIO / ENVIO */}
                        <td className="p-3 align-middle font-mono text-[11px] text-muted-foreground print:text-black">
                          {item.trackingCode ? (
                            <span className="font-semibold text-foreground print:text-black select-all">
                              {item.trackingCode}
                            </span>
                          ) : (
                            <span className="italic text-[10px] text-muted-foreground print:text-gray-500">
                              Aguardando postagem
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RODAPÉ DO DIALOG */}
        <div className="p-3.5 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground no-print">
          <span className="flex items-center gap-1.5">
            <Printer className="size-3.5 text-primary" />
            Dica: Utilize o botão de impressão para levar a lista impressa para sua bancada de empacotamento.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
