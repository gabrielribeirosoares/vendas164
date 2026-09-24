import { useState, useEffect } from 'react';
import { Copy, Check, QrCode, Sparkles, ShieldCheck, Wallet, MessageCircle, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { brl, whatsappLink } from '@/lib/format';
import { generatePixCopiaECola, generatePixQrCode } from '@/lib/pix';
import { toast } from 'sonner';

export interface PixItemDetail {
  orderId: string;
  productName: string;
  quantity?: number;
  amount: number;
  type: 'sinal' | 'saldo' | 'parcela';
}

export interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pixKey: string;
  amount?: number;
  storeName?: string;
  storePhone?: string | null;
  title?: string;
  description?: string;
  orderId?: string;
  items?: PixItemDetail[];
}

export function PixPaymentDialog({
  open,
  onOpenChange,
  pixKey,
  amount,
  storeName = 'Vendas 164',
  storePhone,
  title = 'Pagamento via PIX',
  description,
  orderId,
  items,
}: PixPaymentDialogProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copiaECola, setCopiaECola] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showItems, setShowItems] = useState<boolean>(false);

  // Calcula o valor total com base nos itens selecionados caso o amount não seja fornecido
  const totalAmount = amount !== undefined && amount > 0 
    ? amount 
    : (items ? items.reduce((sum, item) => sum + item.amount, 0) : 0);

  useEffect(() => {
    if (!open || !pixKey) return;

    setLoading(true);
    const txid = orderId ? orderId.replace(/-/g, '').slice(0, 20) : '***';
    const payload = generatePixCopiaECola({
      key: pixKey,
      name: storeName,
      amount: totalAmount,
      txid,
    });

    setCopiaECola(payload);

    generatePixQrCode(payload, { width: 320 })
      .then((url) => {
        setQrCodeUrl(url);
      })
      .catch((err) => {
        console.error('[PixPaymentDialog] Error generating QR Code:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, pixKey, totalAmount, storeName, orderId]);

  const copyCodeToClipboard = async () => {
    if (!copiaECola) return;
    try {
      await navigator.clipboard.writeText(copiaECola);
      setCopiedCode(true);
      toast.success('Código PIX Copia e Cola copiado! Abra o app do seu banco para pagar.');
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const copyKeyToClipboard = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopiedKey(true);
      toast.success('Chave PIX copiada!');
      setTimeout(() => setCopiedKey(false), 3000);
    } catch {
      toast.error('Não foi possível copiar a chave.');
    }
  };

  // Monta a mensagem pronta do WhatsApp listando todos os modelos inclusos
  const whatsappMessage = (() => {
    if (!items || items.length === 0) {
      return `Olá ${storeName}! Acabei de realizar o pagamento de ${brl(totalAmount)} via PIX para minha reserva. Segue o comprovante em anexo!`;
    }
    const lines = items.map(
      (it) => `• ${it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ''}${it.productName} (${it.type === 'sinal' ? 'Sinal' : 'Saldo'}: ${brl(it.amount)})`
    );
    return `Olá ${storeName}! Acabei de realizar o pagamento consolidado de ${brl(totalAmount)} via PIX referente a ${items.length} reserva(s):\n${lines.join('\n')}\n\nSegue o comprovante em anexo!`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center sm:text-left space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
              {storeName && (
                <p className="text-xs text-muted-foreground">Loja: <strong className="text-foreground">{storeName}</strong></p>
              )}
            </div>
          </div>
          {description && (
            <DialogDescription className="text-xs pt-1">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* VALOR EM DESTAQUE */}
        {totalAmount > 0 && (
          <div className="mt-2 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 text-center border border-emerald-500/20">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {items && items.length > 1 ? `Valor total (${items.length} reservas)` : 'Valor a pagar'}
            </span>
            <div className="text-3xl font-extrabold text-foreground mt-0.5">
              {brl(totalAmount)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Pagamento direto na conta do lojista
            </p>
          </div>
        )}

        {/* LISTA DISCRIMINADA DE ITENS SE HOUVER MAIS DE 1 */}
        {items && items.length > 1 && (
          <div className="rounded-xl border border-border/60 bg-muted/30 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowItems(!showItems)}
              className="w-full p-2.5 px-3 flex items-center justify-between text-left font-medium hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Package className="size-3.5 text-primary" />
                <span>Ver as {items.length} miniaturas inclusas</span>
              </span>
              {showItems ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            {showItems && (
              <div className="p-3 pt-0 border-t border-border/40 divide-y divide-border/30 max-h-48 overflow-y-auto">
                {items.map((it, idx) => (
                  <div key={`${it.orderId}-${idx}`} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate text-foreground">
                        {it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ''}{it.productName}
                      </p>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">
                        {it.type === 'sinal' ? 'Sinal da reserva' : 'Saldo restante'}
                      </span>
                    </div>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                      {brl(it.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QR CODE CONTAINER */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative rounded-2xl border border-border/80 bg-white p-3 shadow-sm">
            {loading || !qrCodeUrl ? (
              <div className="flex size-52 items-center justify-center bg-muted/20 rounded-xl">
                <QrCode className="size-12 animate-pulse text-muted-foreground" />
              </div>
            ) : (
              <img
                src={qrCodeUrl}
                alt="QR Code PIX para pagamento"
                className="size-52 rounded-lg object-contain"
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground mt-2 font-medium">
            Aponte a câmera do seu banco para o QR Code
          </span>
        </div>

        {/* BOTÃO PRINCIPAL COPIA E COLA */}
        <div className="space-y-2.5">
          <Button
            type="button"
            className="w-full h-12 text-sm font-semibold gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={copyCodeToClipboard}
          >
            {copiedCode ? (
              <>
                <Check className="size-4" /> Código PIX Copiado!
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copiar Código PIX (Copia e Cola)
              </>
            )}
          </Button>

          {/* CHAVE DIRETA COMO ALTERNATIVA */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/50 border border-border/60 text-xs">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-muted-foreground block font-medium">Ou use a Chave PIX:</span>
              <span className="font-mono font-medium truncate block select-all text-foreground">
                {pixKey}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shrink-0 gap-1.5"
              onClick={copyKeyToClipboard}
            >
              {copiedKey ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              Copiar Chave
            </Button>
          </div>

          {/* BOTÃO DE ENVIAR COMPROVANTE VIA WHATSAPP SE TELEFONE DA LOJA ESTIVER DISPONÍVEL */}
          {storePhone && (
            <a
              href={whatsappLink(storePhone, whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 text-xs font-semibold gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <MessageCircle className="size-4 text-emerald-600" />
                Enviar Comprovante para a Loja no WhatsApp
              </Button>
            </a>
          )}
        </div>

        {/* INSTRUÇÕES SIMPLES */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            Como pagar:
          </div>
          <ol className="list-decimal list-inside space-y-0.5 pl-0.5">
            <li>Abra o aplicativo do seu banco no celular</li>
            <li>Selecione a opção <strong>PIX</strong> e depois <strong>PIX Copia e Cola</strong></li>
            <li>Cole o código copiado e confirme o pagamento</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
