import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Users,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  downloadCSVTemplate,
  parseCSVText,
  processSpreadsheetImport,
  type ParsedSpreadsheetRow,
} from "@/lib/importSpreadsheet";

interface SpreadsheetImporterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
}

export function SpreadsheetImporterDialog({
  open,
  onOpenChange,
  storeId,
}: SpreadsheetImporterDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedSpreadsheetRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    successCount: number;
    errorCount: number;
    errors: string[];
  } | null>(null);

  // Buscar produtos da loja para associação automática
  const { data: storeProducts = [] } = useQuery({
    queryKey: ["store-products-for-import", storeId],
    enabled: open && !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, model, brand")
        .eq("store_id", storeId);
      if (error) throw error;
      return data || [];
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const rows = parseCSVText(text, storeProducts);
        setParsedRows(rows);
        if (rows.length === 0) {
          toast.error("Nenhuma linha válida encontrada no arquivo CSV.");
        } else {
          toast.success(`${rows.length} linha(s) lida(s) com sucesso da planilha!`);
        }
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleStartImport() {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      return toast.error("Não há linhas válidas para importar.");
    }

    setIsProcessing(true);
    setProgressCount(0);
    setImportSummary(null);

    try {
      const result = await processSpreadsheetImport({
        storeId,
        rows: parsedRows,
        onProgress: (current) => setProgressCount(current),
      });

      setImportSummary(result);
      if (result.successCount > 0) {
        toast.success(
          `Importação concluída! ${result.successCount} reservas/cadastros criados com sucesso.`
        );
        // Atualizar queries do React Query
        queryClient.invalidateQueries({ queryKey: ["seller-orders"] });
        queryClient.invalidateQueries({ queryKey: ["client-profiles"] });
        queryClient.invalidateQueries({ queryKey: ["customer-store-links"] });
        queryClient.invalidateQueries({ queryKey: ["store-products"] });
      }

      if (result.errorCount > 0) {
        toast.warning(`${result.errorCount} linha(s) não puderam ser importadas.`);
      }
    } catch (err: any) {
      toast.error(`Erro ao importar planilha: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    setParsedRows([]);
    setFileName("");
    setImportSummary(null);
    setProgressCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Importar Cadastros e Reservas via Planilha
              </DialogTitle>
              <DialogDescription>
                Faça o upload do seu arquivo de clientes e reservas para cadastrá-los em lote no site.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {/* Passo 1: Download de Modelo e Seleção de Arquivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/80 bg-muted/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm mb-1 text-foreground">
                  <Download className="w-4 h-4 text-primary" />
                  1. Baixar Modelo de Planilha
                </div>
                <p className="text-xs text-muted-foreground">
                  Baixe o modelo `.csv` formatado com as colunas certas para preencher os dados dos seus clientes e miniaturas.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full border-primary/30 text-primary hover:bg-primary/5"
                onClick={downloadCSVTemplate}
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar Modelo CSV
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-muted/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm mb-1 text-foreground">
                  <Upload className="w-4 h-4 text-primary" />
                  2. Enviar Arquivo Preenchido
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione o arquivo CSV salvo do seu computador com os cadastros e reservas.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="default"
                size="sm"
                className="mt-3 w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Upload className="w-4 h-4 mr-2" />
                {fileName ? "Trocar Arquivo CSV" : "Selecionar Arquivo CSV"}
              </Button>
            </div>
          </div>

          {/* Nome do Arquivo Selecionado e Resumo de Leitura */}
          {fileName && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span>Arquivo: <strong>{fileName}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  {validCount} válida(s)
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30">
                    {invalidCount} com erro
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs px-2">
                  Limpar
                </Button>
              </div>
            </div>
          )}

          {/* Barra de Progresso durante o Processamento */}
          {isProcessing && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Importando reservas e perfis para o banco de dados...
                </span>
                <span>
                  {progressCount} de {validCount}
                </span>
              </div>
              <Progress value={(progressCount / Math.max(1, validCount)) * 100} />
            </div>
          )}

          {/* Resultado / Resumo da Importação */}
          {importSummary && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Resultado da Importação
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {importSummary.successCount} importados com sucesso
                </span>
                {importSummary.errorCount > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {importSummary.errorCount} falha(s)
                  </span>
                )}
              </div>
              {importSummary.errors.length > 0 && (
                <div className="mt-2 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs max-h-32 overflow-y-auto space-y-1">
                  {importSummary.errors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabela de Pré-visualização das Linhas */}
          {parsedRows.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="p-3 bg-muted/50 border-b flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  Pré-visualização das Linhas ({parsedRows.length})
                </span>
                <span className="text-muted-foreground font-normal">
                  Verifique os dados antes de confirmar a importação
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Modelo / Marca</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Sinal</TableHead>
                      <TableHead>Status Pag.</TableHead>
                      <TableHead>Status Envio</TableHead>
                      <TableHead className="w-20 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => (
                      <TableRow key={row.rowIndex} className={!row.isValid ? "bg-rose-500/5" : ""}>
                        <TableCell className="text-center font-mono text-xs">{row.rowIndex}</TableCell>
                        <TableCell className="font-medium text-xs">
                          {row.clientName || <span className="text-rose-500 italic">Ausente</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.clientPhone || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{row.productModel}</div>
                          <div className="text-[10px] text-muted-foreground">{row.productBrand}</div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {brl(row.totalPrice)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {brl(row.downPayment)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {row.paymentStatus.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] uppercase bg-blue-500/10 text-blue-600 border-blue-500/30">
                            {row.deliveryStatus.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {row.isValid ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-[10px]" title={row.errorReason}>
                              <AlertTriangle className="w-3 h-3 mr-1 inline" />
                              Erro
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="pt-4 border-t flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Fechar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleStartImport}
            disabled={isProcessing || validCount === 0}
            className="px-6"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Confirmar e Importar {validCount} Linha(s)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
